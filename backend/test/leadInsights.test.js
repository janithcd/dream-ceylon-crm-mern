const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
process.env.AUTH_RATE_LIMIT_MAX = "1000";

const app = require("../app");
const Admin = require("../models/Admin");
const Inquiry = require("../models/Inquiry");
const ActivityLog = require("../models/ActivityLog");
const { buildLeadInsightsPipeline, summarizeLeadInsights } = require("../utils/leadInsights");

test("lead cohorts begin on Sri Lanka calendar days and use actual linked bookings", () => {
    const pipeline = buildLeadInsightsPipeline("30", new Date("2026-10-16T19:00:00Z"));
    assert.equal(pipeline[0].$match.createdAt.$gte.toISOString(), "2026-09-17T18:30:00.000Z");
    assert.equal(pipeline[0].$match.createdAt.$lt.toISOString(), "2026-10-17T18:30:00.000Z");
    assert.equal(pipeline[1].$lookup.foreignField, "inquiry");
    assert.equal(pipeline[2].$project.responseMs.$cond[1].$subtract[0], "$firstContactAt");
    assert.equal(pipeline[2].$project.waiting24h.$and[1].$eq[0], "$firstContactAt");
    assert.equal(pipeline[3].$facet.sources[0].$group.within24h.$sum.$cond[0].$and[1].$lte[1], 86400000);
    assert.deepEqual(buildLeadInsightsPipeline("all")[0], { $match: {} });
    assert.throws(() => buildLeadInsightsPipeline("31"), /valid insights period/);
    assert.deepEqual(summarizeLeadInsights({
        sources: [
            { _id: "Referral", inquiries: 3, booked: 2, lost: 1, firstContacts: 2, within24h: 1, responseMsTotal: 28 * 3600000, waiting24h: 1 },
            { _id: "Website", inquiries: 1, booked: 0, lost: 0 },
        ],
        reasons: [{ _id: null, count: 1 }],
    }), {
        summary: { inquiries: 4, booked: 2, lost: 1, conversionRate: 50,
            firstContacts: 2, within24h: 1, within24hRate: 50, averageResponseHours: 14, waiting24h: 1 },
        sources: [
            { source: "Referral", inquiries: 3, booked: 2, lost: 1, conversionRate: 66.7,
                firstContacts: 2, within24h: 1, within24hRate: 50, averageResponseHours: 14, waiting24h: 1 },
            { source: "Website", inquiries: 1, booked: 0, lost: 0, conversionRate: 0,
                firstContacts: 0, within24h: 0, within24hRate: null, averageResponseHours: null, waiting24h: 0 },
        ],
        reasons: [{ reason: "Unspecified", count: 1 }],
    });
    assert.equal(summarizeLeadInsights().summary.conversionRate, 0);
    assert.equal(summarizeLeadInsights().summary.within24hRate, null);
});

test("public and manual inquiry submissions keep source and loss details private to admins", async (t) => {
    const ids = {
        sales: "507f1f77bcf86cd799439811",
        viewer: "507f1f77bcf86cd799439812",
        finance: "507f1f77bcf86cd799439813",
    };
    const stored = new Map();
    const pipelineCalls = [];
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({
        _id: id, status: "Active", tokenVersion: 0,
        role: String(id) === ids.sales ? "Sales" : String(id) === ids.viewer ? "Viewer" : "Finance",
    }) }));
    t.mock.method(Inquiry, "create", async (payload) => {
        const inquiry = new Inquiry(payload);
        await inquiry.validate();
        inquiry.save = async () => { await inquiry.validate(); return inquiry; };
        stored.set(String(inquiry._id), inquiry);
        return inquiry;
    });
    t.mock.method(Inquiry, "findById", (id) => ({
        populate() { return this; },
        then(resolve, reject) { return Promise.resolve(stored.get(String(id)) || null).then(resolve, reject); },
    }));
    t.mock.method(Inquiry, "aggregate", async (pipeline) => {
        pipelineCalls.push(pipeline);
        return [{ sources: [{ _id: "Referral", inquiries: 2, booked: 1, lost: 1 }], reasons: [{ _id: "Budget", count: 1 }] }];
    });
    t.mock.method(ActivityLog, "create", async (payload) => payload);

    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}/api/inquiries`;
    const request = (path, method = "GET", body, role = "sales") => fetch(base + path, {
        method,
        headers: {
            ...(role ? { Authorization: `Bearer ${jwt.sign({ id: ids[role] }, process.env.JWT_SECRET)}` } : {}),
            "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const guest = { fullName: "CI Guest", email: "guest@example.invalid", whatsappNumber: "+94771234567", country: "UK", message: "Trip request" };

    const publicResponse = await request("", "POST", { ...guest, source: "Referral", priority: "High", status: "Cancelled", lossReason: "Other", adminNotes: "Injected" }, null);
    assert.equal(publicResponse.status, 201, await publicResponse.clone().text());
    const publicLead = (await publicResponse.json()).inquiry;
    assert.deepEqual([publicLead.source, publicLead.priority, publicLead.status, publicLead.lossReason, publicLead.adminNotes], ["Website", "Medium", "New", null, ""]);

    assert.equal((await request("/manual", "POST", guest, null)).status, 401);
    assert.equal((await request("/manual", "POST", guest, "viewer")).status, 403);
    assert.equal((await request("/manual", "POST", guest, "finance")).status, 403);
    assert.equal((await request("/manual", "POST", { ...guest, status: "Cancelled" })).status, 400);
    const created = await request("/manual", "POST", { ...guest, source: "Referral", priority: "High" });
    assert.equal(created.status, 201, await created.clone().text());
    const lead = (await created.json()).inquiry;
    assert.equal(lead.source, "Referral");
    assert.equal(lead.priority, "High");

    assert.equal((await request(`/${lead._id}`, "PUT", { status: "Cancelled" }, "viewer")).status, 403);
    assert.equal((await request(`/${lead._id}`, "PUT", { status: "Cancelled" })).status, 400);
    assert.equal((await request(`/${lead._id}`, "PUT", { status: "Cancelled", lossReason: "Invalid" })).status, 400);
    const closed = await request(`/${lead._id}`, "PUT", { status: "Cancelled", lossReason: "Budget", lossNote: "Outside budget" });
    assert.equal(closed.status, 200, await closed.clone().text());
    assert.equal((await closed.json()).inquiry.lossReason, "Budget");
    assert.equal((await request(`/${lead._id}`, "PUT", { lossReason: "" })).status, 400);
    const reopened = await request(`/${lead._id}`, "PUT", { status: "Follow Up" });
    assert.equal(reopened.status, 200);
    assert.deepEqual([(await reopened.json()).inquiry.lossReason, stored.get(lead._id).lossNote], [null, ""]);

    assert.equal((await request("/insights", "GET", undefined, null)).status, 401);
    assert.equal((await request("/insights", "GET", undefined, "finance")).status, 403);
    assert.equal((await request("/insights?window=bad")).status, 400);
    const insights = await request("/insights?window=90");
    assert.equal(insights.status, 200);
    assert.equal((await insights.json()).summary.conversionRate, 50);
    assert.equal(pipelineCalls.length, 1);
    assert.equal((await request("", "GET", undefined, "finance")).status, 403);
    assert.equal((await request(`/${lead._id}`, "DELETE", undefined, "sales")).status, 403);
});
