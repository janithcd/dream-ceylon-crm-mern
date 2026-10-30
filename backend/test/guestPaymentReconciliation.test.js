const test = require("node:test");
const assert = require("node:assert/strict");
const { parseRegisterQuery, parseReconciliation, guestPaymentsCsv } = require("../utils/guestPaymentReconciliation");

test("guest register uses Sri Lanka calendar dates and excludes cancelled payments", () => {
    const parsed = parseRegisterQuery({}, new Date("2026-10-24T20:00:00.000Z"));
    assert.equal(parsed.value.from, "2026-10-01");
    assert.equal(parsed.value.to, "2026-10-25");
    assert.equal(parsed.value.query.paymentDate.$gte.toISOString(), "2026-09-30T18:30:00.000Z");
    assert.equal(parsed.value.query.paymentDate.$lt.toISOString(), "2026-10-25T18:30:00.000Z");
    assert.deepEqual(parsed.value.query.status.$in, ["Received", "Refunded"]);
    assert.equal(parseRegisterQuery({ from: "2026-02-30" }).error !== undefined, true);
    assert.equal(parseRegisterQuery({ from: "2026-10-26", to: "2026-10-25" }).error !== undefined, true);
    assert.equal(parseRegisterQuery({ from: "2025-01-01", to: "2026-10-25" }).error !== undefined, true);
    assert.equal(parseRegisterQuery({ page: "1abc" }).error !== undefined, true);
    assert.equal(parseRegisterQuery({ status: "cancelled" }).error !== undefined, true);
    assert.equal(parseRegisterQuery({ paymentMethod: "payhere" }).error !== undefined, true);
    assert.equal(parseRegisterQuery({ paymentMethod: ["PayHere"] }).error !== undefined, true);
});

test("guest register treats references as literal text and filters missing matches", () => {
    const parsed = parseRegisterQuery({ status: "unreconciled", paymentMethod: "PayHere", reference: " (a+b) " });
    assert.equal(parsed.value.query.reconciledAt, null);
    assert.equal(parsed.value.query.paymentMethod, "PayHere");
    assert.equal(parseRegisterQuery({}).value.query.paymentMethod, undefined);
    assert.equal(parsed.value.query.$or[0].referenceNumber.$regex, "\\(a\\+b\\)");
    assert.deepEqual(parseRegisterQuery({ status: "reconciled" }).value.query.reconciledAt, { $ne: null });
});

test("matching requires a reference and reopening requires an explanation", () => {
    assert.deepEqual(parseReconciliation({ reconciled: true, statementReference: "  BANK-42  " }).value,
        { reconciled: true, statementReference: "BANK-42" });
    assert.deepEqual(parseReconciliation({ reconciled: false, reason: "  Wrong amount  " }).value,
        { reconciled: false, reason: "Wrong amount" });
    for (const body of [{ reconciled: true, statementReference: "  " },
        { reconciled: false, reason: "no" }, { reconciled: "true", statementReference: "a" }]) {
        assert.ok(parseReconciliation(body).error);
    }
});

test("register CSV escapes formulas, quotes, and newlines", () => {
    const csv = guestPaymentsCsv([{ paymentDate: new Date("2026-10-24T19:00:00Z"), paymentNo: "PAY-1",
        booking: { bookingCode: "BC-1", customer: { fullName: '=HYPERLINK("x")' } },
        status: "Received", currency: "USD", amount: 20, paymentMethod: "Card",
        referenceNumber: "line\n2", statementReference: "+cmd", reconciledByName: "A",
        reconciledAt: new Date("2026-10-24T20:00:00Z") }]);
    assert.match(csv, /2026-10-25/);
    assert.match(csv, /'\=HYPERLINK\(""x""\)/);
    assert.match(csv, /"line\n2"/);
    assert.match(csv, /"'\+cmd"/);
});
