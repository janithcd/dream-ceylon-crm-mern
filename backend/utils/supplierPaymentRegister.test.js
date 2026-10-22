const test = require("node:test");
const assert = require("node:assert/strict");
const { parseSupplierPaymentRegisterQuery, supplierPaymentsCsv } = require("./supplierPaymentRegister");

test("register defaults to the Sri Lanka calendar month and matches only one payment array entry", () => {
    const parsed = parseSupplierPaymentRegisterQuery({}, new Date("2026-10-31T19:00:00Z"));
    assert.equal(parsed.value.from, "2026-11-01");
    assert.equal(parsed.value.to, "2026-11-01");
    const match = parsed.value.stages[0].$match.paymentHistory.$elemMatch;
    assert.equal(match.kind, "payment");
    assert.equal(match.paymentDate.$gte.toISOString(), "2026-11-01T00:00:00.000Z");
    assert.equal(match.paymentDate.$lt.toISOString(), "2026-11-02T00:00:00.000Z");
});

test("register validates range and pagination and treats bank references literally", () => {
    for (const query of [
        { from: "2026-02-30" }, { from: "2026-12-02", to: "2026-12-01" },
        { from: "2025-01-01", to: "2026-01-02" }, { page: "0" }, { limit: "51" },
        { reference: "x".repeat(101) },
    ]) assert.ok(parseSupplierPaymentRegisterQuery(query).error);
    const parsed = parseSupplierPaymentRegisterQuery({ from: "2026-01-01", to: "2026-01-31", reference: " A.*[1] " });
    assert.equal(parsed.value.reference, "A.*[1]");
    assert.deepEqual(parsed.value.stages[2].$match["paymentHistory.reference"], { $regex: "A\\.\\*\\[1\\]", $options: "i" });
});

test("CSV quotes supplier fields and blocks spreadsheet formulas", () => {
    const csv = supplierPaymentsCsv([{
        paymentDate: new Date("2026-10-22T00:00:00Z"), bookingCode: "BK-1", customerName: "Guest",
        description: 'Hotel, "West"', currency: "USD", amount: 120.5, method: "Bank transfer",
        reference: "=2+2", note: "note\nline", recordedByName: "Finance",
        recordedAt: new Date("2026-10-22T10:00:00Z"),
    }]);
    assert.ok(csv.includes('"Hotel, ""West"""'));
    assert.ok(csv.includes('"\'=2+2"'));
    assert.ok(csv.includes('"120.50"'));
    assert.ok(csv.includes('"note\nline"'));
});
