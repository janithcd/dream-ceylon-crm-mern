const { test } = require("node:test");
const assert = require("node:assert/strict");
const { authorizePermissions, authorizeAnyPermission } = require("../middleware/permissionMiddleware");
const { resolveAdminPermissions, normalizePermissions } = require("../config/permissions");
function run(middleware, admin) {
    const result = { next: false };
    const res = { status(code) { result.status = code; return this; }, json(body) { result.body = body; return this; } };
    middleware({ admin }, res, () => { result.next = true; });
    return result;
}
test("Viewer cannot write bookings", () => {
    assert.equal(run(authorizePermissions("booking.create"), { role: "Viewer", status: "Active" }).status, 403);
});
test("Sales cannot access payment reports", () => {
    assert.equal(run(authorizePermissions("report.view", "payment.view"), { role: "Sales" }).status, 403);
});
test("Finance can access payment reports", () => {
    assert.equal(run(authorizePermissions("report.view", "payment.view"), { role: "Finance" }).next, true);
});
test("only finance and Super Admin see and manage supplier costs by default", () => {
    for (const role of ["Manager", "Sales", "Viewer"]) {
        assert.equal(run(authorizePermissions("cost.view"), { role }).status, 403);
        assert.equal(run(authorizePermissions("cost.view", "cost.manage"), { role }).status, 403);
    }
    for (const role of ["Finance", "Super Admin"]) {
        assert.equal(run(authorizePermissions("cost.view", "cost.manage"), { role }).next, true);
    }
});
test("Finance cannot manage administrator accounts", () => {
    assert.equal(run(authorizePermissions("admin.create"), { role: "Finance" }).status, 403);
});
test("Manager cannot refund payments", () => {
    assert.equal(run(authorizePermissions("payment.refund"), { role: "Manager" }).status, 403);
});
test("only Finance and Super Admin reconcile guest payments by default", () => {
    for (const role of ["Manager", "Sales", "Viewer"]) {
        assert.equal(run(authorizePermissions("payment.view", "payment.reconcile"), { role }).status, 403);
    }
    for (const role of ["Finance", "Super Admin"]) {
        assert.equal(run(authorizePermissions("payment.view", "payment.reconcile"), { role }).next, true);
    }
});
test("Super Admin can manage administrator accounts", () => {
    assert.equal(run(authorizePermissions("admin.create"), { role: "Super Admin" }).next, true);
});
for (const authorize of [authorizePermissions, authorizeAnyPermission]) {
    test(`${authorize.name} requires authentication`, () => {
        assert.equal(run(authorize("booking.view"), null).status, 401);
    });
    test(`${authorize.name} rejects inactive Super Admins`, () => {
        assert.equal(run(authorize("booking.view"), { role: "Super Admin", status: "Inactive" }).status, 403);
    });
}
test("any-permission authorizer accepts one matching permission", () => {
    assert.equal(run(authorizeAnyPermission("admin.create", "booking.view"), { role: "Viewer" }).next, true);
});
test("unknown roles receive no default permissions", () => {
    assert.deepEqual(resolveAdminPermissions({ role: "Unknown" }), []);
});
test("only known custom permissions are accepted and deduplicated", () => {
    assert.deepEqual(normalizePermissions(["booking.view", "booking.view", "root.access"]), ["booking.view"]);
    assert.deepEqual(normalizePermissions(null), []);
});
