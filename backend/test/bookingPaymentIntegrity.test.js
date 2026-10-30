const test = require("node:test");
const assert = require("node:assert/strict");
const { validatePaymentEntry, netReceivedCents, validateProjectedBalance } = require("../utils/bookingPaymentIntegrity");
const { payHereReceiptKey } = require("../utils/payHereReceipt");

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

test("PayHere entries require a traceable transaction reference", () => {
    const entry = { amount: 100, paymentType: "Advance", status: "Received", paymentMethod: "PayHere" };
    assert.match(validatePaymentEntry({ ...entry, referenceNumber: "" }), /PayHere payment or refund reference/);
    assert.match(validatePaymentEntry({ ...entry, referenceNumber: " ".repeat(101) }), /PayHere payment or refund reference/);
    assert.equal(validatePaymentEntry({ ...entry, referenceNumber: " PH-123 " }), null);
    assert.equal(validatePaymentEntry({ ...entry, paymentType: "Refund", status: "Refunded",
        referenceNumber: "PH-REF-123" }), null);
    assert.equal(validatePaymentEntry({ ...entry, paymentMethod: "Card", referenceNumber: "" }), null);
});

test("only received PayHere transactions claim a normalized reference", () => {
    const entry = { paymentMethod: "PayHere", status: "Received", referenceNumber: "  ph-Ａ12  " };
    assert.equal(payHereReceiptKey(entry), "PH-A12");
    assert.equal(payHereReceiptKey({ ...entry, status: "Cancelled" }), null);
    assert.equal(payHereReceiptKey({ ...entry, status: "Refunded" }), null);
    assert.equal(payHereReceiptKey({ ...entry, paymentMethod: "Bank Transfer" }), null);
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
