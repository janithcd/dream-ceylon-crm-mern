const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const BookingPayment = require("../models/BookingPayment");
const ActivityLog = require("../models/ActivityLog");

const day = 24 * 60 * 60 * 1000;
const calendarDate = (instant) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(instant).map(({ type, value }) => [type, value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
};

const main = async () => {
    if (process.env.CI_SMOKE_TESTS !== "true") {
        throw new Error("This smoke test must be explicitly enabled in CI");
    }
    await mongoose.connect(process.env.MONGO_URI);
    const admins = [];
    let booking;
    try {
        for (const role of ["Sales", "Finance"]) {
            admins.push(await Admin.create({ name: `CI Guest Milestone ${role}`,
                email: `ci-guest-milestone-${role}-${Date.now()}@example.invalid`,
                password: "disposable-ci-only-password", role }));
        }
        const [sales, finance] = admins;
        const token = (admin) => jwt.sign({ id: admin._id, v: 0 }, process.env.JWT_SECRET);
        const request = (path, method = "GET", body, admin = finance) => fetch(`http://127.0.0.1:5000/api${path}`, {
            method, headers: { Authorization: `Bearer ${token(admin)}`, "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const yesterday = calendarDate(new Date(Date.now() - day));
        const final = calendarDate(new Date(Date.now() + 8 * day));
        const created = await request("/bookings", "POST", {
            customer: { fullName: "CI Guest", email: "guest@example.invalid", whatsappNumber: "+94771234567", country: "UK" },
            travelStartDate: calendarDate(new Date(Date.now() + 25 * day)),
            travelEndDate: calendarDate(new Date(Date.now() + 30 * day)),
            numberOfTravelers: 2, totalPrice: 1000, currency: "USD", paymentDueDate: final,
        }, sales);
        assert.equal(created.status, 201, `Create booking: ${await created.clone().text()}`);
        booking = (await created.json()).booking;
        const advanceUrl = `/bookings/${booking._id}/hotel-advance`;
        assert.equal((await request(advanceUrl, "PATCH", { hotelAdvanceAmount: 300, hotelAdvanceDueDate: yesterday }, sales)).status, 403);
        const plan = await request(advanceUrl, "PATCH", { hotelAdvanceAmount: 300, hotelAdvanceDueDate: yesterday });
        assert.equal(plan.status, 200, `Schedule hotel advance: ${await plan.clone().text()}`);
        assert.equal((await (await request(`/bookings/${booking._id}`)).json()).hotelAdvanceAmount, 300);
        assert.equal((await request(`/bookings/${booking._id}/payment-due-date`, "PATCH", {
            paymentDueDate: calendarDate(new Date(Date.now() - 2 * day)),
        })).status, 409);

        const queue = async () => {
            const response = await request("/bookings/outstanding-balances?dateFilter=all");
            assert.equal(response.status, 200, `Balance queue: ${await response.clone().text()}`);
            return (await response.json()).items.find((item) => item._id === booking._id);
        };
        const due = await queue();
        assert.equal(due.nextPaymentStage, "Hotel advance");
        assert.equal(due.nextPaymentAmount, 300);
        assert.equal(calendarDate(new Date(due.nextPaymentDueDate)), yesterday);
        const finalToday = calendarDate(new Date());
        assert.equal((await request(`/bookings/${booking._id}/payment-due-date`, "PATCH", {
            paymentDueDate: finalToday,
        })).status, 200);
        const fullyDue = await queue();
        assert.equal(fullyDue.nextPaymentStage, "Final balance");
        assert.equal(fullyDue.nextPaymentAmount, 1000);
        assert.equal((await request(`/bookings/${booking._id}/payment-due-date`, "PATCH", {
            paymentDueDate: final,
        })).status, 200);
        assert.equal((await (await request("/bookings/outstanding-balances?dateFilter=all&dueFilter=overdue")).json()).total, 1);
        const alert = (await (await request("/bookings/payment-attention")).json()).items;
        assert.equal(alert.find((item) => item._id === booking._id)?.nextPaymentStage, "Hotel advance");

        const payment = await request("/booking-payments", "POST", {
            booking: booking._id, amount: 300, currency: "USD", paymentType: "Advance", status: "Received",
        });
        assert.equal(payment.status, 201, `Record advance: ${await payment.clone().text()}`);
        const balance = await queue();
        assert.equal(balance.recordedPaid, 300);
        assert.equal(balance.nextPaymentStage, "Final balance");
        assert.equal(balance.nextPaymentAmount, 700);
        assert.equal(calendarDate(new Date(balance.nextPaymentDueDate)), final);
        assert.equal((await (await request("/bookings/outstanding-balances?dateFilter=all&dueFilter=overdue")).json()).total, 0);

        const refund = await request("/booking-payments", "POST", {
            booking: booking._id, amount: 100, currency: "USD", paymentType: "Refund", status: "Refunded",
        });
        assert.equal(refund.status, 201, `Record refund: ${await refund.clone().text()}`);
        const reopened = await queue();
        assert.equal(reopened.recordedPaid, 200);
        assert.equal(reopened.nextPaymentStage, "Hotel advance");
        assert.equal(reopened.nextPaymentAmount, 100);
        console.log("Guest hotel advance, final balance, and refund milestone smoke tests passed against MongoDB.");
    } finally {
        if (booking) {
            await BookingPayment.deleteMany({ booking: booking._id });
            await ActivityLog.deleteMany({ $or: [{ relatedRecordId: booking._id }, { "metadata.bookingId": booking._id }] });
            await Booking.deleteOne({ _id: booking._id });
        }
        if (admins.length) await Admin.deleteMany({ _id: { $in: admins.map((admin) => admin._id) } });
        await mongoose.disconnect();
    }
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
