const test = require("node:test");
const assert = require("node:assert/strict");
const { validatePaymentCorrection } = require("../utils/paymentCorrection");

const original = { booking: "booking-1", amount: 100, currency: "USD",
    paymentDate: new Date("2026-10-20T07:00:00Z"), paymentType: "Refund",
    status: "Received", paymentMethod: "Bank Transfer", referenceNumber: "BANK-1",
    notes: "PRIVATE BANK NOTE" };
const now = new Date("2026-10-25T08:00:00Z");

test("payment correction requires an actual change and a bounded reason", () => {
    assert.match(validatePaymentCorrection(original, { ...original },
        { correctionReason: "Verified" }, now).error, /No payment details changed/);
    assert.match(validatePaymentCorrection(original, { ...original, paymentType: "Advance" },
        { correctionReason: " " }, now).error, /correction reason/);
    const result = validatePaymentCorrection(original,
        { ...original, paymentType: "Advance", amount: 90, notes: "PRIVATE NEW NOTE" },
        { correctionReason: "  Checked bank record  " }, now).value;
    assert.deepEqual(result.changedFields, ["amount", "paymentType", "notes"]);
    assert.equal(result.reason, "Checked bank record");
    assert.equal(result.before.paymentType, "Refund");
    assert.equal(result.after.paymentType, "Advance");
    assert.equal(result.before.amount, 100);
    assert.equal(result.after.amount, 90);
    assert.equal(JSON.stringify(result).includes("PRIVATE"), false);
});

test("payment corrections reject future and invalid dates before database writes", () => {
    for (const date of ["2026-10-26", "2026-02-30", "not a date", ""]) {
        const result = validatePaymentCorrection(original,
            { ...original, paymentDate: date }, { correctionReason: "Correct the date", paymentDate: date }, now);
        assert.ok(result.error, date);
    }
    const valid = validatePaymentCorrection(original,
        { ...original, paymentDate: "2026-10-21" },
        { correctionReason: "Bank value date", paymentDate: "2026-10-21" }, now);
    assert.deepEqual(valid.value.changedFields, ["paymentDate"]);
});

test("payment corrections allow changing a verified card transaction to PayHere", () => {
    const result = validatePaymentCorrection(original,
        { ...original, paymentMethod: "PayHere", referenceNumber: "PH-123" },
        { correctionReason: "Verified PayHere transaction" }, now);
    assert.deepEqual(result.value.changedFields, ["paymentMethod", "referenceNumber"]);
    assert.equal(result.value.after.paymentMethod, "PayHere");
});
