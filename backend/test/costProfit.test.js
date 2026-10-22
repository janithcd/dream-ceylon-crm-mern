const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
process.env.AUTH_RATE_LIMIT_MAX = "1000";

const app = require("../app");
const Admin = require("../models/Admin");
const Quotation = require("../models/Quotation");
const Booking = require("../models/Booking");
const CostEntry = require("../models/CostEntry");
const ActivityLog = require("../models/ActivityLog");
const { costSummary, parseCostPayload } = require("../utils/costProfit");
const { parseSupplierPayment } = require("../utils/supplierPayment");

test("cost math requires entered costs and detects changed sale currency", () => {
    assert.equal(costSummary(1000, "USD", []).profit, null);
    assert.deepEqual(costSummary(1000, "USD", [
        { amount: 30000, conversionRate: 0.003333, targetCurrency: "USD" },
        { amount: 20, conversionRate: 1, targetCurrency: "USD" },
    ]), {
        saleAmount: 1000, saleCurrency: "USD", costTotal: 119.99,
        profit: 880.01, marginPercent: 88, entriesCount: 2, currencyMismatch: 0,
    });
    const mismatch = costSummary(1000, "EUR", [
        { amount: 30000, conversionRate: 0.003333, targetCurrency: "USD" },
    ]);
    assert.equal(mismatch.currencyMismatch, 1);
    assert.equal(mismatch.costTotal, null);
    assert.equal(mismatch.profit, null);
});

test("foreign currency needs an explicit valid rate; same currency always uses one", () => {
    assert.equal(parseCostPayload({ category: "Hotel", description: "Room", amount: 100, currency: "LKR" }, "USD").error !== undefined, true);
    assert.equal(parseCostPayload({ category: "Hotel", description: "Room", amount: -10, currency: "USD" }, "USD").error !== undefined, true);
    assert.equal(parseCostPayload({ category: "Hotel", description: "Room", amount: 10, currency: "USD", conversionRate: 200 }, "USD").value.conversionRate, 1);
    assert.equal(parseCostPayload({ category: "Hotel", description: "Room", amount: 100, currency: "LKR", conversionRate: 0.003333 }, "USD").value.conversionRate, 0.003333);
});

test("booking supplier payments validate partial amounts and calendar dates", () => {
    const cost = { category: "Hotel", description: "Room deposit", amount: 150, currency: "USD" };
    const saved = parseCostPayload({ ...cost, paidAmount: 50, paymentDueDate: "2027-03-10" }, "USD", "Booking");
    assert.equal(saved.value.paidAmount, 50);
    assert.equal(saved.value.paymentDueDate.toISOString(), "2027-03-10T00:00:00.000Z");
    assert.equal(parseCostPayload({ ...cost, paidAmount: 150.01 }, "USD", "Booking").error !== undefined, true);
    assert.equal(parseCostPayload({ ...cost, paidAmount: -1 }, "USD", "Booking").error !== undefined, true);
    assert.equal(parseCostPayload({ ...cost, paidAmount: 0.001 }, "USD", "Booking").error !== undefined, true);
    assert.equal(parseCostPayload({ ...cost, paymentDueDate: "2027-02-30" }, "USD", "Booking").error !== undefined, true);
    assert.equal(parseCostPayload({ ...cost, paidAmount: 1 }, "USD", "Quotation").error !== undefined, true);
    assert.equal(parseCostPayload({ ...cost, paymentDueDate: "2027-03-10" }, "USD", "Quotation").error !== undefined, true);

    const updated = parseCostPayload({ ...cost, amount: 160 }, "USD", "Booking", saved.value);
    assert.equal(updated.value.paidAmount, 50, "old clients must not erase recorded payments");
    assert.equal(updated.value.paymentDueDate.toISOString(), "2027-03-10T00:00:00.000Z");
    assert.equal(parseCostPayload({ ...cost, amount: 40 }, "USD", "Booking", saved.value).error !== undefined, true);
    assert.match(parseCostPayload({ ...cost, currency: "GBP", paidAmount: 0 }, "USD", "Booking", saved.value).error, /currency/);
    assert.match(parseCostPayload({ ...cost, currency: "GBP", conversionRate: 1.2, paidAmount: 0 }, "USD", "Booking", {
        ...saved.value, paidAmount: 0, paymentHistory: [{ kind: "adjustment" }],
    }).error, /history/);
});

test("supplier payment entries respect remaining balance and Sri Lanka payment date", () => {
    const now = new Date("2026-10-22T10:00:00.000Z");
    const payment = { amount: 25.50, paymentDate: "2026-10-22", method: "Bank transfer", reference: "  TR-123  ", note: "  Deposit  " };
    const parsed = parseSupplierPayment(payment, 25.50, now);
    assert.equal(parsed.value.amount, 25.50);
    assert.equal(parsed.value.paymentDate.toISOString(), "2026-10-22T00:00:00.000Z");
    assert.equal(parsed.value.reference, "TR-123");
    assert.equal(parsed.value.note, "Deposit");
    assert.match(parseSupplierPayment({ ...payment, amount: 25.51 }, 25.50, now).error, /remaining/);
    assert.match(parseSupplierPayment({ ...payment, amount: 0.001 }, 25.50, now).error, /decimal/);
    assert.match(parseSupplierPayment({ ...payment, amount: 0 }, 25.50, now).error, /positive/);
    assert.match(parseSupplierPayment({ ...payment, paymentDate: "2026-10-23" }, 25.50, now).error, /future/);
    assert.match(parseSupplierPayment({ ...payment, paymentDate: "2026-02-30" }, 25.50, now).error, /valid/);
    assert.match(parseSupplierPayment({ ...payment, method: "Credit number" }, 25.50, now).error, /method/);
    assert.match(parseSupplierPayment({ ...payment, note: "x".repeat(301) }, 25.50, now).error, /300/);
    assert.equal(parseSupplierPayment(payment, 25.50, new Date("2026-10-21T19:00:00.000Z")).value.amount, 25.50,
        "a UTC date before midnight can already be the next Colombo business day");
});

test("cost API restricts supplier costs to finance permissions", async (t) => {
    const quoteId = "507f1f77bcf86cd799439011";
    const financeId = "507f1f77bcf86cd799439012";
    const salesId = "507f1f77bcf86cd799439013";
    const quote = {
        _id: quoteId, quotationNo: "DCJ-Q-TEST", clientName: "Test Client",
        tourTitle: "Private Tour", currency: "USD", totals: { grandTotal: 1000 },
    };
    const entries = [];
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({
        _id: id, role: String(id) === financeId ? "Finance" : "Sales", status: "Active", tokenVersion: 0,
    }) }));
    t.mock.method(Quotation, "findById", () => ({ select: async () => quote }));
    t.mock.method(CostEntry, "find", () => ({
        sort() { return this; },
        lean: async () => entries,
    }));
    t.mock.method(CostEntry, "create", async (value) => {
        const item = {
            _id: "507f1f77bcf86cd799439014", ...value,
            save: async () => {},
            deleteOne: async () => { entries.splice(entries.indexOf(item), 1); },
        };
        entries.push(item);
        return item;
    });
    t.mock.method(CostEntry, "findById", async () => entries[0] || null);
    t.mock.method(ActivityLog, "create", async () => ({}));

    const server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}/api/finance/costs/quotation/${quoteId}`;
    const headers = (id) => ({
        Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}`,
        "Content-Type": "application/json",
    });

    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: headers(salesId) })).status, 403);
    assert.equal((await fetch(url, {
        method: "POST", headers: headers(salesId), body: JSON.stringify({ amount: 1 }),
    })).status, 403);
    const created = await fetch(url, { method: "POST", headers: headers(financeId), body: JSON.stringify({
        category: "Hotel", description: "One room", amount: 30000, currency: "LKR", conversionRate: 0.003333,
    }) });
    assert.equal(created.status, 201);
    const summary = await (await fetch(url, { headers: headers(financeId) })).json();
    assert.equal(summary.summary.costTotal, 99.99);
    assert.equal(summary.summary.profit, 900.01);
    assert.equal(summary.items[0].description, "One room");

    quote.currency = "EUR";
    const stale = await (await fetch(url, { headers: headers(financeId) })).json();
    assert.equal(stale.summary.currencyMismatch, 1);
    assert.equal(stale.summary.profit, null);

    const costUrl = `http://127.0.0.1:${server.address().port}/api/finance/costs/${entries[0]._id}`;
    const paymentUrl = `${costUrl}/payments`;
    assert.equal((await fetch(paymentUrl, { method: "POST", headers: headers(salesId), body: JSON.stringify({ amount: 1 }) })).status, 403);
    const quotePayment = await fetch(paymentUrl, { method: "POST", headers: headers(financeId), body: JSON.stringify({ amount: 1 }) });
    assert.equal(quotePayment.status, 400);
    assert.match((await quotePayment.json()).message, /Only booking costs/, "a quotation estimate cannot receive a supplier payment");
    const revalued = await fetch(costUrl, { method: "PUT", headers: headers(financeId), body: JSON.stringify({
        category: "Hotel", description: "One room", amount: 30000, currency: "LKR", conversionRate: 0.003,
    }) });
    assert.equal(revalued.status, 200);
    assert.equal((await (await fetch(url, { headers: headers(financeId) })).json()).summary.profit, 910);
    assert.equal((await fetch(costUrl, { method: "DELETE", headers: headers(financeId) })).status, 200);
    assert.equal((await (await fetch(url, { headers: headers(financeId) })).json()).summary.profit, null);
});

test("booking profit compares actual costs to its converted quotation estimate", async (t) => {
    const bookingId = "507f1f77bcf86cd799439021";
    const quoteId = "507f1f77bcf86cd799439022";
    const adminId = "507f1f77bcf86cd799439023";
    t.mock.method(Admin, "findById", () => ({ select: async () => ({
        _id: adminId, role: "Finance", status: "Active", tokenVersion: 0,
    }) }));
    t.mock.method(Booking, "findById", () => ({ select: async () => ({
        _id: bookingId, bookingCode: "DCJ-BOOK", customer: { fullName: "Client" },
        currency: "USD", totalPrice: 1000, bookingStatus: "Confirmed",
    }) }));
    t.mock.method(Quotation, "findOne", () => ({ select: async () => ({
        _id: quoteId, quotationNo: "DCJ-Q", currency: "USD", totals: { grandTotal: 1000 },
    }) }));
    t.mock.method(CostEntry, "find", (query) => {
        const items = query.recordType === "Quotation"
            ? [{ amount: 100, conversionRate: 1, targetCurrency: "USD" }]
            : [{ amount: 120, conversionRate: 1, targetCurrency: "USD" }];
        return { sort() { return this; }, lean: async () => items };
    });
    const server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}/api/finance/costs/booking/${bookingId}`;
    const response = await fetch(url, { headers: {
        Authorization: `Bearer ${jwt.sign({ id: adminId }, process.env.JWT_SECRET)}`,
    } });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.summary.profit, 880);
    assert.equal(data.linkedEstimate.estimatedProfit, 900);
    assert.equal(data.linkedEstimate.costDifference, 20);
    assert.equal(data.linkedEstimate.comparable, true);
});
