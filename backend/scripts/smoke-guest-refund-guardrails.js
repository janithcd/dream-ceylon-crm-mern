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
        for (const role of ["Sales", "Finance", "Super Admin"]) {
            admins.push(await Admin.create({ name: `CI Refund ${role}`,
                email: `ci-refund-${role.replace(/\s/g, "-")}-${Date.now()}@example.invalid`,
                password: "disposable-ci-only-password", role }));
        }
        const [sales, finance, superAdmin] = admins;
        const token = (admin) => jwt.sign({ id: admin._id, v: 0 }, process.env.JWT_SECRET);
        const request = (path, method = "GET", body, admin = finance) => fetch(`http://127.0.0.1:5000/api${path}`, {
            method, headers: { Authorization: `Bearer ${token(admin)}`, "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const created = await request("/bookings", "POST", {
            customer: { fullName: "CI Refund Guest", email: "refund@example.invalid", whatsappNumber: "+94771234567", country: "UK" },
            travelStartDate: calendarDate(new Date(Date.now() + 25 * 86400000)),
            travelEndDate: calendarDate(new Date(Date.now() + 30 * 86400000)),
            numberOfTravelers: 2, totalPrice: 1000, currency: "USD",
        }, sales);
        assert.equal(created.status, 201, `Create booking: ${await created.clone().text()}`);
        booking = (await created.json()).booking;
        const payment = (amount, paymentType, status = "Received") => ({
            booking: booking._id, amount, currency: "USD", paymentDate: calendarDate(new Date()),
            paymentType, status, paymentMethod: "Bank Transfer",
        });
        const record = (details) => request("/booking-payments", "POST", details);
        assert.equal((await record(payment(1, "Refund", "Refunded"))).status, 409);
        assert.equal((await record(payment(1, "Refund", "Received"))).status, 400);
        assert.equal((await record(payment(1, "Advance", "Refunded"))).status, 400);
        assert.equal((await record(payment(300.005, "Advance"))).status, 400);
        const receiptResponse = await record(payment(300, "Advance"));
        assert.equal(receiptResponse.status, 201, `Record receipt: ${await receiptResponse.clone().text()}`);
        const receipt = (await receiptResponse.json()).payment;
        const receiptPdf = await request(`/payment-receipts/${receipt._id}`, "POST", {});
        assert.equal(receiptPdf.status, 200, `Receipt PDF: ${await receiptPdf.clone().text()}`);
        assert.match(receiptPdf.headers.get("content-disposition"), /payment-receipt/);
        assert.equal(receiptPdf.headers.get("cache-control"), "no-store");
        const refundResponse = await record(payment(250, "Refund", "Refunded"));
        assert.equal(refundResponse.status, 201, `Record refund: ${await refundResponse.clone().text()}`);
        const refund = (await refundResponse.json()).payment;
        const refundPdf = await request(`/payment-receipts/${refund._id}`, "POST", {});
        assert.equal(refundPdf.status, 200, `Refund PDF: ${await refundPdf.clone().text()}`);
        assert.match(refundPdf.headers.get("content-disposition"), /refund-confirmation/);
        assert.equal(refundPdf.headers.get("cache-control"), "no-store");
        assert.equal((await (await request(`/bookings/${booking._id}`)).json()).advancePayment, 50);
        assert.equal((await record(payment(50.01, "Refund", "Refunded"))).status, 409);
        assert.equal((await request(`/booking-payments/${refund._id}`, "PUT", { paymentType: "Advance" })).status, 400);
        assert.equal((await request(`/booking-payments/${receipt._id}`, "PUT", {
            amount: 249, correctionReason: "Checked receipt amount",
        })).status, 409);
        assert.equal((await request(`/booking-payments/${receipt._id}`, "DELETE", undefined, superAdmin)).status, 409);
        assert.equal((await request(`/booking-payments/${refund._id}`, "PUT", {
            amount: 100, correctionReason: "Verified refund amount",
        })).status, 200);
        assert.equal((await (await request(`/bookings/${booking._id}`)).json()).advancePayment, 200);
        assert.equal((await request(`/booking-payments/${refund._id}`, "PUT", {
            status: "Cancelled", correctionReason: "Refund was not sent",
        })).status, 200);
        assert.equal((await request(`/payment-receipts/${refund._id}`, "POST", {})).status, 409);
        assert.equal((await request("/payment-receipts/not-an-id", "POST", {})).status, 400);
        assert.equal((await (await request(`/bookings/${booking._id}`)).json()).advancePayment, 300);
        assert.equal((await record(payment(300, "Refund", "Refunded"))).status, 201);
        assert.equal((await (await request(`/bookings/${booking._id}`)).json()).paymentStatus, "Refunded");
        assert.equal((await record(payment(0.01, "Refund", "Refunded"))).status, 409);
        assert.equal((await record(payment(100, "Partial Payment"))).status, 201);
        const simultaneous = await Promise.all([
            record(payment(60, "Refund", "Refunded")),
            record(payment(60, "Refund", "Refunded")),
        ]);
        assert.deepEqual(simultaneous.map((response) => response.status).sort(), [201, 409]);
        assert.equal((await (await request(`/bookings/${booking._id}`)).json()).advancePayment, 40);
        console.log("Refund limits, type/status consistency, concurrent writes, receipt protection and correction passed against MongoDB.");
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
