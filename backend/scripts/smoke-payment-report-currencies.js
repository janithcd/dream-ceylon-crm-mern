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
        for (const role of ["Sales", "Finance"]) {
            admins.push(await Admin.create({ name: `CI Report Currency ${role}`,
                email: `ci-report-currency-${role}-${Date.now()}@example.invalid`,
                password: "disposable-ci-only-password", role }));
        }
        const [sales, finance] = admins;
        const token = (admin) => jwt.sign({ id: admin._id, v: 0 }, process.env.JWT_SECRET);
        const request = (path, method = "GET", body, admin = finance) => fetch(`http://127.0.0.1:5000/api${path}`, {
            method, headers: { Authorization: `Bearer ${token(admin)}`, "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const today = calendarDate(new Date());
        for (const [currency, totalPrice] of [["USD", 1000], ["LKR", 10000]]) {
            const response = await request("/bookings", "POST", {
                customer: { fullName: `CI Report ${currency}`, email: `${currency.toLowerCase()}@example.invalid`,
                    whatsappNumber: "+94771234567", country: "UK" },
                travelStartDate: calendarDate(new Date(Date.now() + 25 * 86400000)),
                travelEndDate: calendarDate(new Date(Date.now() + 30 * 86400000)),
                numberOfTravelers: 2, totalPrice, currency,
            }, sales);
            assert.equal(response.status, 201, `Create ${currency} booking: ${await response.clone().text()}`);
            bookings.push((await response.json()).booking);
        }
        const pay = async (booking, amount, status, paymentType) => {
            const response = await request("/booking-payments", "POST", {
                booking: booking._id, amount, currency: booking.currency, paymentDate: today,
                status, paymentType, paymentMethod: "Bank Transfer",
            });
            assert.equal(response.status, 201, `Record ${status}: ${await response.clone().text()}`);
        };
        await pay(bookings[0], 100, "Received", "Advance");
        await pay(bookings[1], 5000, "Received", "Advance");
        await pay(bookings[0], 30, "Refunded", "Refund");
        const report = (suffix = "") => request(`/finance/reports/payments?dateFrom=${today}&dateTo=${today}${suffix}`);
        const all = await report();
        assert.equal(all.status, 200, `All currency report: ${await all.clone().text()}`);
        const data = await all.json();
        assert.equal(data.summary, null);
        assert.deepEqual(data.monthlyStats, []);
        assert.deepEqual(data.methodStats, []);
        assert.deepEqual(data.summaryByCurrency.map((item) => [item.currency, item.netIncome]),
            [["LKR", 5000], ["USD", 70]]);
        const usd = await report("&currency=USD").then((response) => response.json());
        assert.equal(usd.summary.netIncome, 70);
        assert.equal(usd.monthlyStats[0].net, 70);
        assert.equal(usd.methodStats[0].net, 70);
        assert.equal(usd.totalPayments, 2);
        assert.equal((await request("/finance/reports/payments?dateFrom=2026-02-30")).status, 400);
        assert.equal((await request("/finance/reports/payments?page=0")).status, 400);
        console.log("Payment report currency separation and Sri Lanka date filters passed against MongoDB.");
    } finally {
        if (bookings.length) {
            const bookingIds = bookings.map((item) => item._id);
            const payments = await BookingPayment.find({ booking: { $in: bookingIds } }).select("_id");
            await BookingPayment.deleteMany({ booking: { $in: bookingIds } });
            await ActivityLog.deleteMany({ $or: [
                { relatedRecordId: { $in: [...bookingIds, ...payments.map((item) => item._id)] } },
                { "metadata.bookingId": { $in: bookingIds } },
            ] });
            await Booking.deleteMany({ _id: { $in: bookingIds } });
        }
        if (admins.length) await Admin.deleteMany({ _id: { $in: admins.map((admin) => admin._id) } });
        await mongoose.disconnect();
    }
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
