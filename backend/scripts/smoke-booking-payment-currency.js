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
    let booking;
    try {
        for (const role of ["Sales", "Finance", "Manager"]) {
            admins.push(await Admin.create({ name: `CI Payment Currency ${role}`,
                email: `ci-payment-currency-${role}-${Date.now()}@example.invalid`,
                password: "disposable-ci-only-password", role }));
        }
        const [sales, finance, manager] = admins;
        const token = (admin) => jwt.sign({ id: admin._id, v: 0 }, process.env.JWT_SECRET);
        const request = (path, method = "GET", body, admin = finance) => fetch(`http://127.0.0.1:5000/api${path}`, {
            method, headers: { Authorization: `Bearer ${token(admin)}`, "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const today = calendarDate(new Date());
        const response = await request("/bookings", "POST", {
            customer: { fullName: "CI Currency Guest", email: "currency@example.invalid", whatsappNumber: "+94771234567", country: "UK" },
            travelStartDate: calendarDate(new Date(Date.now() + 25 * 86400000)),
            travelEndDate: calendarDate(new Date(Date.now() + 30 * 86400000)),
            numberOfTravelers: 2, totalPrice: 1000, currency: "USD",
        }, sales);
        assert.equal(response.status, 201, `Create booking: ${await response.clone().text()}`);
        booking = (await response.json()).booking;
        const createPayment = (amount, currency) => request("/booking-payments", "POST", {
            booking: booking._id, amount, currency, paymentDate: today,
            paymentType: "Advance", status: "Received", paymentMethod: "Bank Transfer",
        });
        assert.equal((await createPayment(100, "LKR")).status, 400);
        const recorded = await createPayment(300, "USD");
        assert.equal(recorded.status, 201, `Record USD payment: ${await recorded.clone().text()}`);
        const payment = (await recorded.json()).payment;
        assert.equal((await request(`/bookings/${booking._id}`, "PUT", { currency: "LKR" }, sales)).status, 409);
        assert.equal((await request(`/bookings/${booking._id}`, "PUT", { advancePayment: 0 }, sales)).status, 409);
        assert.equal((await request(`/bookings/${booking._id}`, "PUT", { adminNotes: "Check rates" }, sales)).status, 200);
        assert.equal((await request(`/booking-payments/${payment._id}`, "PUT", { currency: "LKR", amount: 300 })).status, 400);
        assert.equal((await (await request(`/bookings/${booking._id}`)).json()).advancePayment, 300);

        // Simulate a legacy row saved before currency checks existed.
        const legacy = await BookingPayment.create({ paymentNo: `CI-LEGACY-${Date.now()}`,
            booking: booking._id, amount: 75, currency: "LKR", paymentDate: new Date(),
            paymentType: "Advance", status: "Received", paymentMethod: "Bank Transfer" });
        assert.equal((await request(`/booking-payments/${legacy._id}/reconciliation`, "PATCH", {
            reconciled: true, statementReference: "BANK-LEGACY",
        })).status, 409);
        assert.equal((await request(`/booking-payments/${legacy._id}`, "PUT", { currency: "USD" })).status, 400);
        const register = await request(`/booking-payments/register?from=${today}&to=${today}`);
        assert.equal(register.status, 200);
        const row = (await register.json()).items.find((item) => item._id === legacy._id.toString());
        assert.equal(row.booking.currency, "USD");
        assert.equal(row.currency, "LKR");
        const exportResponse = await request(`/booking-payments/register/export?from=${today}&to=${today}`);
        assert.match(await exportResponse.text(), /Currency review/);

        assert.equal((await createPayment(50, "USD")).status, 201);
        assert.equal((await (await request(`/bookings/${booking._id}`)).json()).advancePayment, 350);
        assert.equal((await request(`/booking-payments/${legacy._id}`, "PUT", {
            currency: "USD", amount: 15,
        })).status, 400);
        const corrected = await request(`/booking-payments/${legacy._id}`, "PUT", {
            currency: "USD", amount: 15, correctionReason: "LKR 75 at agreed booking conversion",
        });
        assert.equal(corrected.status, 200, `Correct legacy amount: ${await corrected.clone().text()}`);
        assert.equal((await (await request(`/bookings/${booking._id}`)).json()).advancePayment, 365);
        assert.equal((await request(`/booking-payments/${legacy._id}/reconciliation`, "PATCH", {
            reconciled: true, statementReference: "BANK-CORRECTED",
        })).status, 200);
        const audit = await ActivityLog.findOne({ relatedRecordId: legacy._id, "metadata.correctionReason": "LKR 75 at agreed booking conversion" });
        assert.equal(audit?.metadata.previousCurrency, "LKR");
        assert.equal(audit?.metadata.previousAmount, 75);
        const refundResponse = await request("/booking-payments", "POST", {
            booking: booking._id, amount: 25, currency: "USD", paymentDate: today,
            paymentType: "Refund", status: "Refunded", paymentMethod: "Bank Transfer",
        });
        assert.equal(refundResponse.status, 201);
        const refund = (await refundResponse.json()).payment;
        assert.equal((await request(`/booking-payments/${refund._id}`, "PUT", { amount: 20 }, manager)).status, 403);
        assert.equal((await (await request(`/bookings/${booking._id}`)).json()).advancePayment, 340);
        console.log("Booking currency lock, payment validation, and legacy currency review passed against MongoDB.");
    } finally {
        if (booking) {
            const payments = await BookingPayment.find({ booking: booking._id }).select("_id");
            await BookingPayment.deleteMany({ booking: booking._id });
            await ActivityLog.deleteMany({ $or: [
                { relatedRecordId: booking._id },
                { relatedRecordId: { $in: payments.map((item) => item._id) } },
                { "metadata.bookingId": booking._id },
            ] });
            await Booking.deleteOne({ _id: booking._id });
        }
        if (admins.length) await Admin.deleteMany({ _id: { $in: admins.map((admin) => admin._id) } });
        await mongoose.disconnect();
    }
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
