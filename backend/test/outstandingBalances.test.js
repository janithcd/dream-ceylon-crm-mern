const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";

const app = require("../app");
const Booking = require("../models/Booking");
const Admin = require("../models/Admin");
const ActivityLog = require("../models/ActivityLog");
const { buildOutstandingBalancesPipeline } = require("../utils/outstandingBalances");
const { parsePaymentDueDate } = require("../utils/paymentDueDate");

test("payment due dates validate calendar days and can be cleared", () => {
    assert.equal(parsePaymentDueDate("2028-02-29").value.toISOString(), "2028-02-29T00:00:00.000Z");
    assert.equal(parsePaymentDueDate("").value, null);
    assert.equal(parsePaymentDueDate(null).value, null);
    for (const invalid of ["2027-02-29", "2026-10-1", "tomorrow", 123, undefined]) {
        assert.ok(parsePaymentDueDate(invalid).error);
    }
});

test("open balances use recorded amounts and Sri Lanka payment days without exposing contact details", () => {
    const now = new Date("2026-10-16T19:00:00Z");
    const pipeline = buildOutstandingBalancesPipeline({ dateFilter: "next30", page: 2 }, now);
    assert.deepEqual(pipeline[0].$match.bookingStatus.$in, ["Pending", "Confirmed", "In Progress", "Completed"]);
    assert.deepEqual(pipeline[1].$project.recordedPaid, { $ifNull: ["$advancePayment", 0] });
    assert.deepEqual(pipeline[1].$project.balance, {
        $round: [{ $subtract: ["$totalPrice", { $ifNull: ["$advancePayment", 0] }] }, 2],
    });
    assert.deepEqual(Object.keys(pipeline[1].$project).sort(), [
        "balance", "bookingCode", "bookingStatus", "currency", "customerName", "paymentDueDate", "recordedPaid", "totalPrice", "travelEndDate", "travelStartDate",
    ].sort());
    assert.deepEqual(pipeline[2].$match, { balance: { $gt: 0 } });
    const selected = { travelStartDate: {
        $gte: new Date("2026-10-16T18:30:00Z"),
        $lt: new Date("2026-11-15T18:30:00Z"),
    } };
    assert.deepEqual(pipeline[3].$facet.items[0].$match, selected);
    assert.deepEqual(pipeline[3].$facet.total[0].$match, selected);
    assert.equal(pipeline[3].$facet.items.find((step) => Object.hasOwn(step, "$skip")).$skip, 20);
    assert.deepEqual(buildOutstandingBalancesPipeline({ dateFilter: "departed" }, now)[3].$facet.items[0].$match, {
        travelStartDate: { $lt: selected.travelStartDate.$gte },
    });
    assert.deepEqual(buildOutstandingBalancesPipeline({ dateFilter: "later" }, now)[3].$facet.items[0].$match, {
        travelStartDate: { $gte: selected.travelStartDate.$lt },
    });
    const overdue = buildOutstandingBalancesPipeline({ dateFilter: "all", dueFilter: "overdue" }, now);
    assert.deepEqual(overdue[3].$facet.items[0].$match, {
        paymentDueDate: { $ne: null, $lt: selected.travelStartDate.$gte },
    });
    assert.deepEqual(buildOutstandingBalancesPipeline({ dateFilter: "all", dueFilter: "due7" }, now)[3].$facet.items[0].$match, {
        paymentDueDate: { $gte: selected.travelStartDate.$gte, $lt: new Date("2026-10-23T18:30:00Z") },
    });
    assert.deepEqual(buildOutstandingBalancesPipeline({ dateFilter: "all", dueFilter: "unscheduled" }, now)[3].$facet.items[0].$match, {
        paymentDueDate: null,
    });
    assert.equal(overdue[3].$facet.items[1].$addFields.dueMissing.$cond[1], 1);
    assert.equal(overdue[3].$facet.items[2].$sort.paymentDueDate, 1);
});

test("balance queue requires booking and payment view and validates filters", async (t) => {
    const financeId = "507f1f77bcf86cd799439081";
    const salesId = "507f1f77bcf86cd799439082";
    let aggregateCalls = 0;
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({
        _id: id, role: String(id) === salesId ? "Sales" : "Finance", status: "Active", tokenVersion: 0,
    }) }));
    t.mock.method(Booking, "aggregate", async () => {
        aggregateCalls += 1;
        return [{
            summary: [{ open: 2, departed: 1, next30: 1, later: 0, overdue: 1, due7: 0, scheduledLater: 0, unscheduled: 1 }],
            total: [{ value: 1 }],
            items: [{ bookingCode: "DCJ-1", totalPrice: 1000, recordedPaid: 400, balance: 600, currency: "USD" }],
        }];
    });

    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}/api/bookings/outstanding-balances`;
    const request = (query, id) => fetch(`${url}${query}`, {
        headers: id ? { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` } : {},
    });

    assert.equal((await request("")).status, 401);
    assert.equal((await request("", salesId)).status, 403);
    for (const query of ["?dateFilter=soon", "?dueFilter=soon", "?page=0", "?page=1.5", "?page=10001"]) {
        assert.equal((await request(query, financeId)).status, 400);
    }
    assert.equal(aggregateCalls, 0);
    const response = await request("?dateFilter=departed&dueFilter=overdue&page=1", financeId);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.deepEqual(data.summary, { open: 2, departed: 1, next30: 1, later: 0, overdue: 1, due7: 0, scheduledLater: 0, unscheduled: 1 });
    assert.equal(data.total, 1);
    assert.equal(data.items[0].balance, 600);
    assert.equal(aggregateCalls, 1);
});

test("finance can set and clear a payment due date; viewers and sales cannot", async (t) => {
    const bookingId = "507f1f77bcf86cd799439091";
    const financeId = "507f1f77bcf86cd799439092";
    const salesId = "507f1f77bcf86cd799439093";
    const viewerId = "507f1f77bcf86cd799439094";
    const booking = new Booking({
        _id: bookingId, bookingCode: "DCJ-TEST-DUE",
        customer: { fullName: "Guest", email: "guest@example.test", whatsappNumber: "123", country: "UK" },
        travelStartDate: new Date("2027-03-01"), travelEndDate: new Date("2027-03-10"),
        numberOfTravelers: 2, totalPrice: 1000,
    });
    const logs = [];
    let updates = 0;
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({
        _id: id, role: String(id) === financeId ? "Finance" : String(id) === salesId ? "Sales" : "Viewer",
        status: "Active", tokenVersion: 0,
    }) }));
    t.mock.method(ActivityLog, "create", async (log) => { logs.push(log); return log; });
    t.mock.method(Booking, "findByIdAndUpdate", async (id, update) => {
        updates += 1;
        if (String(id) !== bookingId) return null;
        booking.paymentDueDate = update.$set.paymentDueDate;
        return booking;
    });

    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}/api/bookings/${bookingId}/payment-due-date`;
    const request = (id, body, path = url) => fetch(path, {
        method: "PATCH", headers: {
            Authorization: id ? `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` : "",
            "Content-Type": "application/json",
        }, body: JSON.stringify(body),
    });

    assert.equal((await request(null, { paymentDueDate: "2027-02-28" })).status, 401);
    assert.equal((await request(salesId, { paymentDueDate: "2027-02-28" })).status, 403);
    assert.equal((await request(viewerId, { paymentDueDate: "2027-02-28" })).status, 403);
    for (const body of [{}, { paymentDueDate: "2027-02-30" }, { paymentDueDate: 10 }]) {
        assert.equal((await request(financeId, body)).status, 400);
    }
    assert.equal((await request(financeId, { paymentDueDate: null }, url.replace(bookingId, "invalid"))).status, 400);
    assert.equal(updates, 0);

    const set = await request(financeId, { paymentDueDate: "2027-02-28" });
    assert.equal(set.status, 200);
    assert.equal((await set.json()).paymentDueDate, "2027-02-28T00:00:00.000Z");
    assert.equal(logs.at(-1).referenceNo, "DCJ-TEST-DUE");
    const cleared = await request(financeId, { paymentDueDate: null });
    assert.equal(cleared.status, 200);
    assert.equal((await cleared.json()).paymentDueDate, null);
    assert.equal((await request(financeId, { paymentDueDate: null }, url.replace(bookingId, "507f1f77bcf86cd799439099"))).status, 404);
    assert.equal(updates, 3);
});

test("booking creation and editing preserve validated payment due dates", async (t) => {
    const salesId = "507f1f77bcf86cd799439095";
    let created;
    let createCalls = 0;
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({
        _id: id, role: "Sales", status: "Active", tokenVersion: 0,
    }) }));
    t.mock.method(ActivityLog, "create", async () => ({}));
    t.mock.method(Booking, "exists", async () => null);
    t.mock.method(Booking, "create", async (payload) => {
        createCalls += 1;
        created = new Booking(payload);
        t.mock.method(created, "populate", () => created);
        t.mock.method(created, "save", async () => created);
        return created;
    });
    t.mock.method(Booking, "findById", () => created);

    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}/api/bookings`;
    const headers = { Authorization: `Bearer ${jwt.sign({ id: salesId }, process.env.JWT_SECRET)}`, "Content-Type": "application/json" };
    const body = {
        customer: { fullName: "Guest", email: "guest@example.test", whatsappNumber: "123", country: "UK" },
        travelStartDate: "2027-03-01", travelEndDate: "2027-03-10", numberOfTravelers: 2,
        totalPrice: 1000, paymentDueDate: "2027-02-28",
    };
    const request = (path, method, value) => fetch(path, { method, headers, body: JSON.stringify(value) });

    assert.equal((await request(url, "POST", { ...body, paymentDueDate: "2027-02-30" })).status, 400);
    assert.equal(createCalls, 0);
    const response = await request(url, "POST", body);
    assert.equal(response.status, 201);
    assert.equal((await response.json()).booking.paymentDueDate, "2027-02-28T00:00:00.000Z");
    await created.validate();

    const editUrl = `${url}/${created._id}`;
    assert.equal((await request(editUrl, "PUT", { paymentDueDate: "2027-02-30" })).status, 400);
    assert.equal(created.paymentDueDate.toISOString(), "2027-02-28T00:00:00.000Z");
    assert.equal((await request(editUrl, "PUT", { totalPrice: 1200 })).status, 200);
    assert.equal(created.paymentDueDate.toISOString(), "2027-02-28T00:00:00.000Z");
    const cleared = await request(editUrl, "PUT", { paymentDueDate: null });
    assert.equal(cleared.status, 200);
    assert.equal((await cleared.json()).booking.paymentDueDate, null);
});
