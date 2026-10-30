const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const BookingPayment = require("../models/BookingPayment");
const ActivityLog = require("../models/ActivityLog");

const calendarDate = (instant) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(instant).map(({ type, value }) => [type, value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
};

const main = async () => {
    if (process.env.CI_SMOKE_TESTS !== "true") throw new Error("This smoke test must be explicitly enabled in CI");
    await mongoose.connect(process.env.MONGO_URI);
    const admins = [];
    const bookings = [];
    try {
        const index = (await BookingPayment.collection.indexes()).find((item) =>
            item.unique && item.key.payHereReceiptKey === 1);
        assert.deepEqual(index?.partialFilterExpression,
            { payHereReceiptKey: { $type: "string" } }, "PayHere reference index must be ready");
        for (const role of ["Sales", "Finance"]) {
            admins.push(await Admin.create({ name: `CI PayHere ${role}`,
                email: `ci-payhere-${role}-${Date.now()}@example.invalid`,
                password: "disposable-ci-only-password", role }));
        }
        const token = (admin) => jwt.sign({ id: admin._id, v: 0 }, process.env.JWT_SECRET);
        const request = (path, method, body, admin = admins[1]) => fetch(`http://127.0.0.1:5000/api${path}`, {
            method, headers: { Authorization: `Bearer ${token(admin)}`, "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const today = calendarDate(new Date());
        for (const name of ["One", "Two"]) {
            const response = await request("/bookings", "POST", {
                customer: { fullName: `CI PayHere Guest ${name}`, email: `${name.toLowerCase()}@example.invalid`,
                    whatsappNumber: "+94771234567", country: "UK" },
                travelStartDate: calendarDate(new Date(Date.now() + 25 * 86400000)),
                travelEndDate: calendarDate(new Date(Date.now() + 30 * 86400000)),
                numberOfTravelers: 2, totalPrice: 1000, currency: "USD",
            }, admins[0]);
            assert.equal(response.status, 201, `Create booking: ${await response.clone().text()}`);
            bookings.push((await response.json()).booking);
        }
        const referencePrefix = `CI-PH-${Date.now()}`;
        const entry = (booking, referenceNumber, status = "Received") => ({
            booking: booking._id, amount: 100, currency: "USD", paymentDate: today,
            paymentType: status === "Refunded" ? "Refund" : "Advance",
            status, paymentMethod: "PayHere", referenceNumber,
        });
        const record = (details) => request("/booking-payments", "POST", details);
        const first = await record(entry(bookings[0], `${referencePrefix}-ONE`));
        assert.equal(first.status, 201, `Record first: ${await first.clone().text()}`);
        const firstId = (await first.json()).payment._id;
        const duplicate = await record(entry(bookings[1], ` ${referencePrefix.toLowerCase()}-one `));
        assert.equal(duplicate.status, 409);
        assert.match((await duplicate.json()).message, /already recorded/);
        assert.equal((await record(entry(bookings[0], `${referencePrefix}-ONE`))).status, 409);

        // A refund can carry the original transaction reference without claiming
        // a second receipt, and a cancelled entry leaves a reference available.
        assert.equal((await record({ ...entry(bookings[0], `${referencePrefix}-ONE`, "Refunded"), amount: 20 })).status, 201);
        assert.equal((await record(entry(bookings[0], `${referencePrefix}-CANCEL`, "Cancelled"))).status, 201);
        const second = await record(entry(bookings[1], `${referencePrefix}-CANCEL`));
        assert.equal(second.status, 201, `Reuse cancelled reference: ${await second.clone().text()}`);
        const secondId = (await second.json()).payment._id;
        assert.equal((await request(`/booking-payments/${secondId}`, "PUT", {
            referenceNumber: `${referencePrefix}-ONE`, correctionReason: "Correct transaction reference",
        })).status, 409);

        const simultaneous = await Promise.all(bookings.map((booking) =>
            record(entry(booking, `${referencePrefix}-RACE`))));
        assert.deepEqual(simultaneous.map((response) => response.status).sort(), [201, 409]);

        // Simulate a receipt saved before indexed keys existed.
        await BookingPayment.create({ ...entry(bookings[1], `${referencePrefix}-LEGACY`),
            paymentNo: `${referencePrefix}-LEGACY-PAY` });
        assert.equal((await record(entry(bookings[0], ` ${referencePrefix.toLowerCase()}-legacy `))).status, 409);
        assert.equal((await request(`/booking-payments/${firstId}`, "PUT", {
            amount: 110, correctionReason: "Verified received amount",
        })).status, 200, "editing the same receipt must not conflict with itself");
        const paid = await Promise.all(bookings.map(async (booking) =>
            (await (await request(`/bookings/${booking._id}`, "GET")).json()).advancePayment));
        assert.equal(paid[0] + paid[1], 290, "a rejected duplicate must not increase either balance");
        console.log("PayHere duplicate references, legacy checks, refunds, cancellations, corrections and concurrent writes passed.");
    } finally {
        const bookingIds = bookings.map((item) => item._id);
        if (bookingIds.length) {
            const payments = await BookingPayment.find({ booking: { $in: bookingIds } }).select("_id");
            await BookingPayment.deleteMany({ booking: { $in: bookingIds } });
            await ActivityLog.deleteMany({ $or: [
                { relatedRecordId: { $in: [...bookingIds, ...payments.map((item) => item._id) ] } },
                { "metadata.bookingId": { $in: bookingIds } },
            ] });
            await Booking.deleteMany({ _id: { $in: bookingIds } });
        }
        if (admins.length) await Admin.deleteMany({ _id: { $in: admins.map((item) => item._id) } });
        await mongoose.disconnect();
    }
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
