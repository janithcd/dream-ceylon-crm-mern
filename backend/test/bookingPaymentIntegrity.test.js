const test = require("node:test");
const assert = require("node:assert/strict");
const { validatePaymentEntry, netReceivedCents, validateProjectedBalance } = require("../utils/bookingPaymentIntegrity");

test("refunds need matching type and status and monetary amounts use cents", () => {
    assert.equal(validatePaymentEntry({ amount: 0.01, paymentType: "Refund", status: "Refunded" }), null);
    assert.equal(validatePaymentEntry({ amount: 10, paymentType: "Refund", status: "Cancelled" }), null);
    for (const entry of [
        { amount: 10, paymentType: "Refund", status: "Received" },
        { amount: 10, paymentType: "Advance", status: "Refunded" },
        { amount: 1.005, paymentType: "Advance", status: "Received" },
        { amount: 0, paymentType: "Advance", status: "Received" },
    ]) assert.ok(validatePaymentEntry(entry));
});

test("refund capacity follows real receipts and excludes cancelled and foreign-currency records", () => {
    const payments = [
        { _id: "receipt", currency: "USD", amount: 100.1, status: "Received" },
        { _id: "refund", currency: "USD", amount: 20.05, status: "Refunded" },
        { _id: "cancelled", currency: "USD", amount: 999, status: "Cancelled" },
        { _id: "legacy", currency: "LKR", amount: 999, status: "Received" },
    ];
    assert.equal(netReceivedCents(payments, "USD"), 8005);
    assert.equal(validateProjectedBalance(payments, "USD", null,
        { currency: "USD", amount: 80.05, status: "Refunded" }), null);
    assert.match(validateProjectedBalance(payments, "USD", null,
        { currency: "USD", amount: 80.06, status: "Refunded" }), /Available to refund: USD 80.05/);
    assert.ok(validateProjectedBalance(payments, "USD", payments[0], null));
    assert.ok(validateProjectedBalance(payments, "USD", payments[0],
        { currency: "USD", amount: 20, status: "Received" }));
    assert.equal(validateProjectedBalance(payments, "USD", payments[1], null), null);
});

test("legacy negative balances can improve without allowing a deeper deficit", () => {
    const old = [{ _id: "old", currency: "USD", amount: 10, status: "Refunded" }];
    assert.equal(validateProjectedBalance(old, "USD", null,
        { currency: "USD", amount: 1, status: "Received" }), null);
    assert.ok(validateProjectedBalance(old, "USD", null,
        { currency: "USD", amount: 1, status: "Refunded" }));
});
