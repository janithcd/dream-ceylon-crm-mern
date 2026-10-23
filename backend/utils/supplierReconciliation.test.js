const test = require("node:test");
const assert = require("node:assert/strict");
const { parseSupplierReconciliation } = require("./supplierReconciliation");

test("bank matches require a statement reference and reopening requires an explanation", () => {
    for (const input of [{}, { reconciled: "true" }, { reconciled: true, statementReference: " " },
        { reconciled: true, statementReference: "x".repeat(101) },
        { reconciled: false }, { reconciled: false, reason: "  x " }]) {
        assert.ok(parseSupplierReconciliation(input).error);
    }
    assert.deepEqual(parseSupplierReconciliation({ reconciled: true, statementReference: "  BANK-42  " }),
        { value: { reconciled: true, statementReference: "BANK-42" } });
    assert.deepEqual(parseSupplierReconciliation({ reconciled: false, reason: "  Wrong transaction  " }),
        { value: { reconciled: false, reason: "Wrong transaction" } });
});
