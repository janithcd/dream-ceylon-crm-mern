const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
process.env.AUTH_RATE_LIMIT_MAX = "1000";

const app = require("../app");
const Admin = require("../models/Admin");
const Quotation = require("../models/Quotation");
const ActivityLog = require("../models/ActivityLog");

test("revision endpoint copies an unconverted offer into a separate draft with restricted access", async (t) => {
    const sourceId = "507f1f77bcf86cd799439701";
    const salesId = "507f1f77bcf86cd799439702";
    const viewerId = "507f1f77bcf86cd799439703";
    const createOnlyId = "507f1f77bcf86cd799439704";
    const source = new Quotation({
        _id: sourceId, quotationNo: "DCJ-Q-2026-654321", status: "Sent",
        clientName: "Test Guest", tourTitle: "Seven day tour", country: "UK",
        travelStartDate: "2027-03-01", travelEndDate: "2027-03-07", travelers: 2,
        durationDays: 7, vehicleType: "Car", vehicleDailyRate: 80, vehicleDays: 7,
        hotelCost: 200, discount: 30, advancePayment: 100, currency: "USD",
        totals: { vehicleTotal: 560, hotelTotal: 200, subtotal: 760, discount: 30,
            grandTotal: 730, advancePayment: 100, balancePayment: 630 },
        inclusions: ["Private car"], exclusions: ["Flights"], notes: "Guest details", adminNotes: "Internal details",
        validUntil: "2026-10-31", sentDate: "2026-10-20",
    });
    let revision = null;
    const original = source.toObject();
    let createCalls = 0;
    let logs = 0;
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({
        _id: id, status: "Active", tokenVersion: 0,
        role: String(id) === viewerId ? "Viewer" : String(id) === createOnlyId ? "Unknown Role" : "Sales",
        customPermissions: String(id) === createOnlyId ? ["quotation.create"] : [],
    }) }));
    t.mock.method(Quotation, "findById", (id) => {
        const found = String(id) === sourceId ? source : String(id) === String(revision?._id) ? revision : null;
        const query = {
            populate() { return this; },
            then(resolve, reject) { return Promise.resolve(found).then(resolve, reject); },
        };
        return query;
    });
    t.mock.method(Quotation, "exists", async () => false);
    t.mock.method(Quotation, "create", async (payload) => {
        createCalls += 1;
        revision = new Quotation(payload);
        return revision;
    });
    t.mock.method(ActivityLog, "create", async (entry) => { logs += 1; return entry; });
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const endpoint = `http://127.0.0.1:${server.address().port}/api/quotations/${sourceId}/revisions`;
    const request = (url = endpoint, id = salesId, body) => fetch(url, {
        method: "POST", headers: id ? { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}`, "Content-Type": "application/json" } : {},
        body: body === undefined ? undefined : JSON.stringify(body),
    });

    assert.equal((await request(endpoint, null)).status, 401);
    assert.equal((await request(endpoint, viewerId)).status, 403);
    assert.equal((await request(endpoint, createOnlyId)).status, 403);
    assert.equal((await request(endpoint.replace(sourceId, "bad"))).status, 400);
    assert.equal((await request(endpoint.replace(sourceId, "507f1f77bcf86cd799439799"))).status, 404);
    assert.equal(createCalls, 0);

    const response = await request(endpoint, salesId, { status: "Accepted", vehicleDailyRate: 1, booking: sourceId, validUntil: "2099-01-01" });
    assert.equal(response.status, 201, await response.clone().text());
    const { quotation: draft } = await response.json();
    assert.match(draft.quotationNo, /^DCJ-Q-\d{4}-\d{6,8}$/);
    assert.notEqual(draft.quotationNo, source.quotationNo);
    assert.equal(draft.revisionSourceNo, source.quotationNo);
    assert.equal(draft.revisionOf, sourceId);
    assert.equal(draft.status, "Draft");
    assert.equal(draft.booking, null);
    assert.equal(draft.validUntil, null);
    assert.equal(draft.sentDate, null);
    assert.equal(draft.acceptedDate, null);
    assert.equal(draft.vehicleDailyRate, 80);
    assert.equal(draft.totals.grandTotal, 730);
    assert.deepEqual(draft.inclusions, ["Private car"]);
    assert.deepEqual(draft.exclusions, ["Flights"]);
    assert.equal(draft.adminNotes, "Internal details");
    assert.deepEqual(source.toObject(), original);
    assert.equal(createCalls, 1);
    assert.equal(logs, 1);

    source.booking = sourceId;
    assert.equal((await request()).status, 409);
    assert.equal(createCalls, 1);
});
