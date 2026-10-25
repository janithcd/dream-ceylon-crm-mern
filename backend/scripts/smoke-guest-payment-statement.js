const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const BookingPayment = require("../models/BookingPayment");
const ActivityLog = require("../models/ActivityLog");

const day = 86400000;
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
    let booking;
    try {
        for (const role of ["Sales", "Finance", "Viewer"]) {
            admins.push(await Admin.create({ name: `CI Statement ${role}`,
                email: `ci-statement-${role}-${Date.now()}@example.invalid`,
                password: "disposable-ci-only-password", role }));
        }
        const [sales, finance, viewer] = admins;
        const token = (admin) => jwt.sign({ id: admin._id, v: 0 }, process.env.JWT_SECRET);
        const request = (path, method = "GET", body, admin = finance) => fetch(`http://127.0.0.1:5000/api${path}`, {
            method, headers: { Authorization: `Bearer ${token(admin)}`, "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const final = calendarDate(new Date(Date.now() + 8 * day));
        const created = await request("/bookings", "POST", {
            customer: { fullName: "CI Statement Guest", email: "statement@example.invalid", whatsappNumber: "+94771234567", country: "UK" },
            travelStartDate: calendarDate(new Date(Date.now() + 25 * day)),
            travelEndDate: calendarDate(new Date(Date.now() + 30 * day)),
            numberOfTravelers: 2, totalPrice: 1000, currency: "USD", paymentDueDate: final,
        }, sales);
        assert.equal(created.status, 201, `Create booking: ${await created.clone().text()}`);
        booking = (await created.json()).booking;
        const path = `/booking-pdf/payment-statement/${booking._id}`;
        assert.equal((await request(path, "POST", {}, sales)).status, 403);
        assert.equal((await request(path, "POST", {}, viewer)).status, 403);
        assert.equal((await request("/booking-pdf/payment-statement/invalid", "POST", {})).status, 400);
        const plan = await request(`/bookings/${booking._id}/hotel-advance`, "PATCH", {
            hotelAdvanceAmount: 500, hotelAdvanceDueDate: calendarDate(new Date(Date.now() + 3 * day)),
        });
        assert.equal(plan.status, 200, `Set hotel advance: ${await plan.clone().text()}`);
        const record = (amount, paymentType, status = "Received") => request("/booking-payments", "POST", {
            booking: booking._id, amount, currency: "USD", paymentDate: calendarDate(new Date()),
            paymentType, status, paymentMethod: "Bank Transfer",
        });
        assert.equal((await record(500, "Advance")).status, 201);
        assert.equal((await record(100, "Refund", "Refunded")).status, 201);
        const pdf = await request(path, "POST", {});
        assert.equal(pdf.status, 200, `Statement PDF: ${await pdf.clone().text()}`);
        assert.match(pdf.headers.get("content-disposition"), /payment-statement/);
        assert.equal(pdf.headers.get("cache-control"), "no-store");
        assert.match(pdf.headers.get("content-type"), /application\/pdf/);
        assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), "%PDF");
        assert.ok(await ActivityLog.findOne({ relatedRecordId: booking._id,
            "metadata.documentType": "Guest Payment Statement", "metadata.balance": 600 }));

        const legacy = await BookingPayment.create({ paymentNo: `CI-FOREIGN-${Date.now()}`,
            booking: booking._id, amount: 10, currency: "LKR", status: "Received",
            paymentType: "Advance" });
        assert.equal((await request(path, "POST", {})).status, 409);
        await BookingPayment.deleteOne({ _id: legacy._id });
        await Booking.updateOne({ _id: booking._id }, { $set: { advancePayment: 900 } });
        assert.equal((await request(path, "POST", {})).status, 409);
        await Booking.updateOne({ _id: booking._id }, { $set: { advancePayment: 400 } });
        assert.equal((await request(path, "POST", {})).status, 200);
        console.log("Guest payment statement permissions, balances, PDF and legacy review passed against MongoDB.");
    } finally {
        if (booking) {
            await BookingPayment.deleteMany({ booking: booking._id });
            await ActivityLog.deleteMany({ $or: [
                { relatedRecordId: booking._id }, { "metadata.bookingId": booking._id },
            ] });
            await Booking.deleteOne({ _id: booking._id });
        }
        if (admins.length) await Admin.deleteMany({ _id: { $in: admins.map((admin) => admin._id) } });
        await mongoose.disconnect();
    }
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
