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
            admins.push(await Admin.create({ name: `CI Guest Match ${role}`,
                email: `ci-guest-match-${role.replace(/\s/g, "-")}-${Date.now()}@example.invalid`,
                password: "disposable-ci-only-password", role }));
        }
        const [sales, finance, superAdmin] = admins;
        const token = (admin) => jwt.sign({ id: admin._id, v: 0 }, process.env.JWT_SECRET);
        const request = (path, method = "GET", body, admin = finance) => fetch(`http://127.0.0.1:5000/api${path}`, {
            method, headers: { Authorization: `Bearer ${token(admin)}`, "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const today = calendarDate(new Date());
        const created = await request("/bookings", "POST", {
            customer: { fullName: "CI Match Guest", email: "guest@example.invalid", whatsappNumber: "+94771234567", country: "UK" },
            travelStartDate: calendarDate(new Date(Date.now() + 25 * 86400000)),
            travelEndDate: calendarDate(new Date(Date.now() + 30 * 86400000)),
            numberOfTravelers: 2, totalPrice: 1000, currency: "USD",
        }, sales);
        assert.equal(created.status, 201, `Create booking: ${await created.clone().text()}`);
        booking = (await created.json()).booking;
        const missingReference = await request("/booking-payments", "POST", {
            booking: booking._id, amount: 300, currency: "USD", paymentDate: today,
            paymentType: "Advance", paymentMethod: "PayHere", status: "Received",
        });
        assert.equal(missingReference.status, 400);
        const recorded = await request("/booking-payments", "POST", {
            booking: booking._id, amount: 300, currency: "USD", paymentDate: today,
            paymentType: "Advance", paymentMethod: "PayHere", status: "Received", referenceNumber: "PAY-REF",
        });
        assert.equal(recorded.status, 201, `Record payment: ${await recorded.clone().text()}`);
        const payment = (await recorded.json()).payment;
        const register = (suffix = "") => request(`/booking-payments/register?from=${today}&to=${today}${suffix}`);
        assert.equal((await register()).status, 200);
        assert.equal((await register("&status=unreconciled").then((r) => r.json())).total, 1);
        assert.equal((await register("&status=reconciled").then((r) => r.json())).total, 0);
        assert.equal((await register("&reference=PAY-REF").then((r) => r.json())).total, 1);
        assert.equal((await register("&paymentMethod=PayHere&status=unreconciled").then((r) => r.json())).total, 1);
        assert.equal((await register("&paymentMethod=Bank%20Transfer").then((r) => r.json())).total, 0);
        assert.equal((await register("&paymentMethod=payhere")).status, 400);
        assert.equal((await request(`/booking-payments/register/export?from=${today}&to=${today}&paymentMethod=PayHere`, "GET", undefined, superAdmin)).status, 200);
        assert.equal((await request("/booking-payments/register?from=2026-02-30&to=2026-10-25")).status, 400);
        assert.equal((await request(`/booking-payments/register?from=${today}&to=${today}`, "GET", undefined, sales)).status, 403);
        assert.equal((await request(`/booking-payments/${payment._id}/reconciliation`, "PATCH", {
            reconciled: true, statementReference: "BANK-42",
        }, sales)).status, 403);
        assert.equal((await request(`/booking-payments/${payment._id}/reconciliation`, "PATCH", {
            reconciled: true, statementReference: " ",
        })).status, 400);
        const match = await request(`/booking-payments/${payment._id}/reconciliation`, "PATCH", {
            reconciled: true, statementReference: " BANK-42 ",
        });
        assert.equal(match.status, 200, `Match payment: ${await match.clone().text()}`);
        assert.equal((await match.json()).payment.statementReference, "BANK-42");
        assert.equal((await register("&status=reconciled").then((r) => r.json())).total, 1);
        assert.equal((await register("&status=unreconciled").then((r) => r.json())).total, 0);
        assert.equal((await register("&reference=BANK-42").then((r) => r.json())).total, 1);
        assert.equal((await request(`/booking-payments/${payment._id}/reconciliation`, "PATCH", {
            reconciled: true, statementReference: "BANK-42",
        })).status, 409);
        assert.equal((await request(`/booking-payments/${payment._id}`, "PUT", { amount: 250 })).status, 409);
        assert.equal((await request(`/booking-payments/${payment._id}`, "DELETE", undefined, superAdmin)).status, 409);
        const exported = await request(`/booking-payments/register/export?from=${today}&to=${today}`, "GET", undefined, superAdmin);
        assert.equal(exported.status, 200);
        assert.match(await exported.text(), /BANK-42/);
        assert.equal((await (await request(`/bookings/${booking._id}`)).json()).advancePayment, 300);
        assert.equal((await request(`/booking-payments/${payment._id}/reconciliation`, "PATCH", {
            reconciled: false, reason: "no",
        })).status, 400);
        const reopened = await request(`/booking-payments/${payment._id}/reconciliation`, "PATCH", {
            reconciled: false, reason: "Incorrect statement entry",
        });
        assert.equal(reopened.status, 200, `Reopen payment: ${await reopened.clone().text()}`);
        const history = (await reopened.json()).payment.reconciliationHistory;
        assert.deepEqual(history.map((event) => event.action), ["reconciled", "reopened"]);
        assert.equal(history[1].statementReference, "BANK-42");
        assert.equal((await request(`/booking-payments/${payment._id}`, "PUT", {
            amount: 275, correctionReason: "Checked bank deposit",
        })).status, 200);
        assert.equal((await (await request(`/bookings/${booking._id}`)).json()).advancePayment, 275);
        const refundResponse = await request("/booking-payments", "POST", {
            booking: booking._id, amount: 50, currency: "USD", paymentDate: today,
            paymentType: "Refund", paymentMethod: "Bank Transfer", status: "Refunded", referenceNumber: "REF-50",
        });
        assert.equal(refundResponse.status, 201, `Record refund: ${await refundResponse.clone().text()}`);
        const refund = (await refundResponse.json()).payment;
        const payHereExport = await request(`/booking-payments/register/export?from=${today}&to=${today}&paymentMethod=PayHere`,
            "GET", undefined, superAdmin);
        assert.equal(payHereExport.status, 200);
        const payHereCsv = await payHereExport.text();
        assert.match(payHereCsv, /PAY-REF/);
        assert.doesNotMatch(payHereCsv, /REF-50/);
        assert.equal((await request(`/booking-payments/${refund._id}/reconciliation`, "PATCH", {
            reconciled: true, statementReference: "BANK-REFUND-42",
        })).status, 200);
        const cancelled = await request("/booking-payments", "POST", {
            booking: booking._id, amount: 20, currency: "USD", paymentDate: today,
            paymentType: "Other", status: "Cancelled",
        });
        assert.equal(cancelled.status, 201, `Record cancelled entry: ${await cancelled.clone().text()}`);
        const result = await register().then((response) => response.json());
        assert.equal(result.total, 2);
        assert.equal((await register("&paymentMethod=PayHere").then((r) => r.json())).total, 1);
        assert.equal((await register("&paymentMethod=Bank%20Transfer").then((r) => r.json())).total, 1);
        assert.deepEqual(result.totalsByCurrency, [{ currency: "USD", received: 275, refunded: 50, net: 225 }]);
        assert.equal((await (await request(`/bookings/${booking._id}`)).json()).advancePayment, 225);
        console.log("Guest payment register, matching, reopening, edit lock, and export passed against MongoDB.");
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
