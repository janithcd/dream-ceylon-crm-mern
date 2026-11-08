const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
process.env.AUTH_RATE_LIMIT_MAX = "1000";

const app = require("../app");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const CostEntry = require("../models/CostEntry");
const SupplierInvoice = require("../models/SupplierInvoice");
const ActivityLog = require("../models/ActivityLog");

test("booking deletion preserves supplier payment history", async (t) => {
    const adminId = "507f1f77bcf86cd799439011";
    const bookingId = "507f1f77bcf86cd799439012";
    let hasPayments = true;
    let hasInvoices = false;
    let hasHandoverNotes = false;
    let hasExcursions = false;
    let deleteRace = false;
    let deleted = false;
    let cleaned = false;
    t.mock.method(Admin, "findById", () => ({ select: async () => ({
        _id: adminId, role: "Super Admin", status: "Active", tokenVersion: 0,
    }) }));
    t.mock.method(Booking, "findById", async () => ({
        _id: bookingId, bookingCode: "DCJ-TEST", customer: { fullName: "CI Guest" },
        excursions: hasExcursions ? [{ title: "Retained activity" }] : [],
        deleteOne: async function () {
            assert.deepEqual(this.$where, { "excursions.0": { $exists: false } });
            if (deleteRace) return { deletedCount: 0 };
            deleted = true;
            return { deletedCount: 1 };
        },
    }));
    t.mock.method(Booking, "exists", async (query) => {
        assert.deepEqual(query["handoverNotes.0"], { $exists: true });
        return hasHandoverNotes ? { _id: bookingId } : null;
    });
    t.mock.method(CostEntry, "exists", async () => hasPayments ? { _id: "507f1f77bcf86cd799439013" } : null);
    t.mock.method(SupplierInvoice, "exists", async () => hasInvoices ? { _id: "507f1f77bcf86cd799439014" } : null);
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
    hasHandoverNotes = true;
    const protectedResponse = await fetch(url, { method: "DELETE", headers });
    assert.equal(protectedResponse.status, 409);
    assert.match((await protectedResponse.json()).message, /handover notes/);
    assert.equal(deleted, false);
    hasHandoverNotes = false;
    hasInvoices = true;
    const invoiceProtected = await fetch(url, { method: "DELETE", headers });
    assert.equal(invoiceProtected.status, 409);
    assert.match((await invoiceProtected.json()).message, /supplier invoice history/);
    hasInvoices = false;
    hasExcursions = true;
    const activityProtected = await fetch(url, { method: "DELETE", headers });
    assert.equal(activityProtected.status, 409);
    assert.match((await activityProtected.json()).message, /activity reservation history/);
    hasExcursions = false;
    deleteRace = true;
    assert.equal((await fetch(url, { method: "DELETE", headers })).status, 409);
    assert.equal(deleted, false);
    assert.equal(cleaned, false);
    deleteRace = false;
    assert.equal((await fetch(url, { method: "DELETE", headers })).status, 200);
    assert.equal(deleted, true);
    assert.equal(cleaned, true);
});
