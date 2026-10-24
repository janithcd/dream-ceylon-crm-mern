const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
process.env.AUTH_RATE_LIMIT_MAX = "1000";

const app = require("../app");
const Admin = require("../models/Admin");
const Inquiry = require("../models/Inquiry");
const ActivityLog = require("../models/ActivityLog");

test("lead queue is permissioned, oldest first and only includes new inquiries", async (t) => {
    const salesId = "507f1f77bcf86cd799439911";
    const viewerId = "507f1f77bcf86cd799439912";
    const financeId = "507f1f77bcf86cd799439913";
    const inactiveId = "507f1f77bcf86cd799439914";
    const inquiryId = "507f1f77bcf86cd799439915";
    let status = "New";
    let owner = null;
    let firstContactAt = null;
    const updates = [];
    const logs = [];
    let readQuery, readSort;
    const admin = (id) => ({
        _id: id, name: "CI Admin", role: String(id) === viewerId ? "Viewer" : String(id) === financeId ? "Finance" : "Sales",
        status: String(id) === inactiveId ? "Inactive" : "Active", tokenVersion: 0,
    });
    t.mock.method(Admin, "findById", (id) => ({ select: async () => admin(id) }));
    t.mock.method(Admin, "find", () => ({
        select() { return this; }, sort() { return this; },
        lean: async () => [admin(salesId), admin(viewerId)],
    }));
    t.mock.method(Inquiry, "find", (query) => {
        readQuery = query;
        return {
            select() { return this; }, sort(value) { readSort = value; return this; },
            skip() { return this; }, limit() { return this; }, populate() { return this; },
            then(resolve, reject) { return Promise.resolve([{ _id: inquiryId, fullName: "CI Guest", status: "New" }]).then(resolve, reject); },
        };
    });
    t.mock.method(Inquiry, "countDocuments", async (query) => query.assignedTo === null ? 1 : query.assignedTo ? 0 : 1);
    t.mock.method(Inquiry, "exists", async () => true);
    t.mock.method(Inquiry, "findOneAndUpdate", async (query, change) => {
        updates.push({ query, change });
        if (status !== "New") return null;
        if (Array.isArray(change)) {
            status = "Contacted";
            owner ||= salesId;
            firstContactAt = new Date();
        } else {
            owner = change.$set.assignedTo;
        }
        return {
            _id: inquiryId, fullName: "CI Guest", status, assignedTo: owner, firstContactAt,
            populate: async function () { return this; },
        };
    });
    t.mock.method(ActivityLog, "create", async (entry) => { logs.push(entry); return entry; });

    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}/api/inquiries`;
    const request = (path, method = "GET", body, id = salesId) => fetch(base + path, {
        method, headers: {
            ...(id ? { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` } : {}),
            "Content-Type": "application/json",
        }, body: body === undefined ? undefined : JSON.stringify(body),
    });

    assert.equal((await request("/triage", "GET", undefined, null)).status, 401);
    assert.equal((await request("/triage", "GET", undefined, financeId)).status, 403);
    assert.equal((await request("/triage?page=0")).status, 400);
    assert.equal((await request("/triage?filter=bad")).status, 400);
    const queue = await request("/triage?filter=unassigned&page=1", "GET", undefined, viewerId);
    assert.equal(queue.status, 200);
    assert.equal((await queue.json()).summary.unassigned, 1);
    assert.deepEqual(readQuery, { status: "New", assignedTo: null });
    assert.deepEqual(readSort, { createdAt: 1, _id: 1 });

    assert.equal((await request("/assignees", "GET", undefined, viewerId)).status, 403);
    const assignees = await request("/assignees");
    assert.equal(assignees.status, 200);
    assert.deepEqual((await assignees.json()).admins.map((person) => person._id), [salesId]);

    assert.equal((await request(`/${inquiryId}/assignee`, "PATCH", { assignedTo: salesId }, viewerId)).status, 403);
    assert.equal((await request(`/${inquiryId}/assignee`, "PATCH", {})).status, 400);
    assert.equal((await request(`/${inquiryId}/assignee`, "PATCH", { assignedTo: inactiveId })).status, 400);
    const assigned = await request(`/${inquiryId}/assignee`, "PATCH", { assignedTo: salesId });
    assert.equal(assigned.status, 200, await assigned.clone().text());
    assert.equal((await assigned.json()).inquiry.assignedTo, salesId);
    assert.deepEqual(updates[0].query.status, { $in: ["New", "Contacted", "Follow Up"] });

    assert.equal((await request(`/${inquiryId}/contacted`, "PATCH", {}, viewerId)).status, 403);
    assert.equal((await request(`/${inquiryId}/contacted`, "PATCH", {})).status, 400);
    const contacted = await request(`/${inquiryId}/contacted`, "PATCH", { channel: "WhatsApp" });
    assert.equal(contacted.status, 200, await contacted.clone().text());
    assert.equal((await contacted.json()).inquiry.status, "Contacted");
    assert.equal(updates[1].query.status, "New");
    assert.equal(updates[1].change[0].$set.firstContactChannel.$ifNull[1], "WhatsApp");
    assert.equal((await request(`/${inquiryId}/contacted`, "PATCH", { channel: "Phone" })).status, 409);
    assert.equal(logs.length, 2);
});
