const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
process.env.AUTH_RATE_LIMIT_MAX = "1000";

const app = require("../app");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const CostEntry = require("../models/CostEntry");
const ActivityLog = require("../models/ActivityLog");

test("booking deletion preserves supplier payment history", async (t) => {
    const adminId = "507f1f77bcf86cd799439011";
    const bookingId = "507f1f77bcf86cd799439012";
    let hasPayments = true;
    let deleted = false;
    let cleaned = false;
    t.mock.method(Admin, "findById", () => ({ select: async () => ({
        _id: adminId, role: "Super Admin", status: "Active", tokenVersion: 0,
    }) }));
    t.mock.method(Booking, "findById", async () => ({
        _id: bookingId, bookingCode: "DCJ-TEST", customer: { fullName: "CI Guest" },
        deleteOne: async () => { deleted = true; },
    }));
    t.mock.method(CostEntry, "exists", async () => hasPayments ? { _id: "507f1f77bcf86cd799439013" } : null);
    t.mock.method(CostEntry, "deleteMany", async () => { cleaned = true; });
    t.mock.method(ActivityLog, "create", async () => ({}));

    const server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}/api/bookings/${bookingId}`;
    const headers = { Authorization: `Bearer ${jwt.sign({ id: adminId }, process.env.JWT_SECRET)}` };

    const blocked = await fetch(url, { method: "DELETE", headers });
    assert.equal(blocked.status, 409);
    assert.match((await blocked.json()).message, /recorded supplier payments/);
    assert.equal(deleted, false);
    assert.equal(cleaned, false);

    hasPayments = false;
    assert.equal((await fetch(url, { method: "DELETE", headers })).status, 200);
    assert.equal(deleted, true);
    assert.equal(cleaned, true);
});
