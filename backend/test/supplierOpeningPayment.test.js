const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
const app = require("../app");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const CostEntry = require("../models/CostEntry");
const ActivityLog = require("../models/ActivityLog");
const { unitemizedPaidCents } = require("../utils/supplierPayment");

test("unitemized paid amount excludes individual payments but keeps legacy corrections available", () => {
    assert.equal(unitemizedPaidCents({ paidAmount: 16000, paymentHistory: [] }), 1600000);
    assert.equal(unitemizedPaidCents({ paidAmount: 21000, paymentHistory: [
        { kind: "adjustment", amount: 16000 }, { kind: "payment", amount: 5000 },
    ] }), 1600000);
    assert.equal(unitemizedPaidCents({ paidAmount: 16000, paymentHistory: [
        { kind: "adjustment", amount: 16000 }, { kind: "payment", amount: 16000, allocatedFromPaidTotal: true },
    ] }), 0);
});

test("documenting a historical bank transfer leaves paid totals unchanged and enables a voucher", async (t) => {
    const ids = { finance: "507f1f77bcf86cd799439071", sales: "507f1f77bcf86cd799439072",
        booking: "507f1f77bcf86cd799439073", cost: "507f1f77bcf86cd799439074" };
    let stored = new CostEntry({ _id: ids.cost, __v: 0, recordType: "Booking", recordId: ids.booking,
        category: "Hotel", description: "Laluna Resort", amount: 16000, currency: "LKR", conversionRate: 0.003,
        targetCurrency: "USD", paidAmount: 16000, createdBy: ids.finance,
        paymentHistory: [{ kind: "adjustment", amount: 16000, paidAmountAfter: 16000, note: "Earlier paid total",
            recordedBy: ids.finance, recordedByName: "Finance" }] }).toObject();
    const logs = [];
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({ _id: id, name: "Finance",
        role: String(id) === ids.finance ? "Finance" : "Sales", status: "Active", tokenVersion: 0 }) }));
    t.mock.method(Booking, "findById", () => ({ select: async () => ({ _id: ids.booking, bookingCode: "DCJ-TEST",
        customer: { fullName: "Guest" }, currency: "USD", totalPrice: 1000, bookingStatus: "Confirmed" }) }));
    t.mock.method(CostEntry, "findById", async (id) => {
        if (String(id) !== ids.cost) return null;
        const doc = CostEntry.hydrate(stored);
        doc.save = async () => {
            await doc.validate();
            doc.__v += 1;
            stored = doc.toObject();
            return doc;
        };
        return doc;
    });
    t.mock.method(ActivityLog, "create", async (entry) => { logs.push(entry); return entry; });

    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const path = `http://127.0.0.1:${server.address().port}/api/finance/costs/${ids.cost}/payments/from-paid-total`;
    const payment = { amount: 16000, paymentDate: "2026-01-15", method: "Bank transfer",
        reference: "BANK-LALUNA-123", expectedVersion: 0, confirmed: true };
    const post = (body, id = ids.finance) => fetch(path, { method: "POST",
        headers: { ...(id ? { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` } : {}),
            "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal((await post(payment, null)).status, 401);
    assert.equal((await post(payment, ids.sales)).status, 403);
    assert.equal((await post({ ...payment, confirmed: false })).status, 400);
    assert.equal((await post({ ...payment, expectedVersion: 7 })).status, 409);
    assert.equal((await post({ ...payment, amount: 16000.01 })).status, 400);
    assert.equal((await post({ ...payment, paymentDate: "2099-01-01" })).status, 400);
    assert.equal((await post({ ...payment, reference: "" })).status, 400);
    assert.equal(stored.paymentHistory.length, 1);

    const response = await post(payment);
    assert.equal(response.status, 201, await response.clone().text());
    assert.equal(response.headers.get("cache-control"), "no-store");
    const result = await response.json();
    assert.equal(result.paidAmount, 16000);
    assert.equal(result.payment.allocatedFromPaidTotal, true);
    assert.equal(stored.paidAmount, 16000);
    assert.equal(stored.paymentHistory.length, 2);
    assert.equal(stored.paymentHistory[1].reference, "BANK-LALUNA-123");
    assert.equal(logs.length, 1);
    assert.doesNotMatch(JSON.stringify(logs), /16000|BANK-LALUNA-123/);
    assert.equal((await post(payment)).status, 409, "a retry from a stale tab cannot create a duplicate");
    assert.equal((await post({ ...payment, expectedVersion: 1 })).status, 409, "the amount was fully itemized");

    const voucher = await fetch(path.replace("/from-paid-total", `/${result.payment._id}/remittance`), {
        headers: { Authorization: `Bearer ${jwt.sign({ id: ids.finance }, process.env.JWT_SECRET)}` },
    });
    assert.equal(voucher.status, 200);
    assert.equal((await voucher.json()).payment.amount, 16000);
});
