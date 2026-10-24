const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
process.env.AUTH_RATE_LIMIT_MAX = "1000";

const app = require("../app");
const Admin = require("../models/Admin");
const FollowUp = require("../models/FollowUp");
const ActivityLog = require("../models/ActivityLog");
const { getBusinessDayBounds } = require("../utils/businessDate");

test("follow-up ownership validates staff and scopes the due queue and summary", async (t) => {
    const ids = {
        sales: "507f1f77bcf86cd799439a11",
        manager: "507f1f77bcf86cd799439a12",
        inactive: "507f1f77bcf86cd799439a13",
        viewer: "507f1f77bcf86cd799439a14",
    };
    const admins = {
        [ids.sales]: { _id: ids.sales, name: "Sales", role: "Sales", status: "Active", tokenVersion: 0 },
        [ids.manager]: { _id: ids.manager, name: "Manager", role: "Manager", status: "Active", tokenVersion: 0 },
        [ids.inactive]: { _id: ids.inactive, name: "Former Sales", role: "Sales", status: "Inactive", tokenVersion: 0 },
        [ids.viewer]: { _id: ids.viewer, name: "Viewer", role: "Viewer", status: "Active", tokenVersion: 0 },
    };
    const stored = new Map();
    const listQueries = [];
    const countQueries = [];
    const logs = [];
    const matches = (doc, query) => Object.entries(query).every(([key, expected]) => {
        const actual = doc[key];
        if (key === "$or") return expected.some((part) => matches(doc, part));
        if (key === "assignedTo") {
            if (expected && typeof expected === "object" && "$in" in expected) {
                return expected.$in.some((value) => String(value) === String(actual));
            }
            return String(actual) === String(expected);
        }
        if (key === "followUpDate") return Object.entries(expected).every(([op, value]) => {
            const date = new Date(actual).getTime();
            const bound = new Date(value).getTime();
            return { $gte: date >= bound, $lte: date <= bound, $lt: date < bound, $gt: date > bound }[op];
        });
        if (expected && typeof expected === "object" && "$regex" in expected) {
            return new RegExp(expected.$regex, expected.$options).test(actual);
        }
        return String(actual) === String(expected);
    });
    const queryResult = (documents) => ({
        sort() { return this; }, skip() { return this; }, limit() { return this; },
        populate() { return this; },
        then(resolve, reject) { return Promise.resolve(documents).then(resolve, reject); },
    });

    t.mock.method(Admin, "findById", (id) => ({ select: async () => admins[String(id)] || null }));
    t.mock.method(Admin, "find", () => ({
        select() { return this; }, sort() { return this; },
        lean: async () => [admins[ids.manager], admins[ids.sales], admins[ids.viewer]],
    }));
    t.mock.method(FollowUp, "create", async (payload) => {
        const doc = new FollowUp(payload);
        await doc.validate();
        doc.save = async () => { await doc.validate(); stored.set(String(doc._id), doc); return doc; };
        stored.set(String(doc._id), doc);
        return doc;
    });
    t.mock.method(FollowUp, "findById", (id) => queryResult(stored.get(String(id)) || null));
    t.mock.method(FollowUp, "find", (query) => {
        listQueries.push(query);
        return queryResult([...stored.values()].filter((doc) => matches(doc, query)));
    });
    t.mock.method(FollowUp, "countDocuments", async (query = {}) => {
        countQueries.push(query);
        return [...stored.values()].filter((doc) => matches(doc, query)).length;
    });
    t.mock.method(ActivityLog, "create", async (entry) => { logs.push(entry); return entry; });

    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}/api/follow-ups`;
    const request = (path, method = "GET", body, id = ids.sales) => fetch(base + path, {
        method,
        headers: {
            ...(id ? { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` } : {}),
            "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const { start, end } = getBusinessDayBounds();
    const reminder = { title: "Call guest", followUpDate: start.toISOString(), type: "Client Call" };

    assert.equal((await request("/assignees", "GET", undefined, null)).status, 401);
    const options = await (await request("/assignees", "GET", undefined, ids.viewer)).json();
    assert.deepEqual(options.admins.map(({ _id }) => _id), [ids.manager, ids.sales]);
    assert.equal((await request("", "POST", reminder, ids.viewer)).status, 403);
    assert.equal((await request("", "POST", { ...reminder, assignedTo: "bad" })).status, 400);
    assert.equal((await request("", "POST", { ...reminder, assignedTo: ids.inactive })).status, 400);
    assert.equal((await request("", "POST", { ...reminder, assignedTo: ids.viewer })).status, 400);
    assert.equal(stored.size, 0);

    const created = await request("", "POST", reminder);
    assert.equal(created.status, 201, await created.clone().text());
    const mine = (await created.json()).followUp;
    assert.equal(mine.assignedTo, ids.sales);

    const unassigned = await request("", "POST", {
        ...reminder, title: "Waiting for owner", assignedTo: null,
        followUpDate: new Date(start.getTime() - 86400000).toISOString(),
    });
    assert.equal(unassigned.status, 201, await unassigned.clone().text());
    const unassignedId = (await unassigned.json()).followUp._id;
    const colleague = await request("", "POST", {
        ...reminder, title: "Manager task", assignedTo: ids.manager,
        followUpDate: new Date(end.getTime() + 86400000).toISOString(),
    });
    assert.equal(colleague.status, 201, await colleague.clone().text());

    assert.equal((await request("?owner=invalid")).status, 400);
    assert.equal((await request("/summary?owner=invalid")).status, 400);
    const due = await (await request("?owner=attention&dateFilter=due&keyword=guest")).json();
    assert.equal(due.totalFollowUps, 1);
    assert.deepEqual(listQueries.at(-1).assignedTo.$in.map(String), ["null", ids.sales]);
    assert.equal(listQueries.at(-1).status, "Pending");
    assert.equal(listQueries.at(-1).followUpDate.$lte.getTime(), end.getTime());
    assert.ok(listQueries.at(-1).$or);
    assert.equal((await (await request("?owner=mine&dateFilter=due")).json()).totalFollowUps, 1);
    assert.equal((await (await request("?owner=unassigned&dateFilter=overdue")).json()).totalFollowUps, 1);
    assert.equal((await (await request(`?owner=${ids.manager}`)).json()).totalFollowUps, 1);
    const summary = await (await request("/summary?owner=attention")).json();
    assert.deepEqual([summary.pending, summary.today, summary.overdue, summary.upcoming], [2, 1, 1, 0]);
    assert.ok(countQueries.some((query) => query.assignedTo?.$in && query.status === "Pending"));

    assert.equal((await request(`/${unassignedId}`, "PUT", { assignedTo: ids.inactive })).status, 400);
    const reassigned = await request(`/${unassignedId}`, "PUT", { assignedTo: ids.manager });
    assert.equal(reassigned.status, 200, await reassigned.clone().text());
    assert.equal((await reassigned.json()).followUp.assignedTo, ids.manager);
    // Existing assignments survive routine edits after their owner becomes inactive.
    admins[ids.manager].status = "Inactive";
    const edited = await request(`/${unassignedId}`, "PUT", { title: "New title", assignedTo: ids.manager });
    assert.equal(edited.status, 200, await edited.clone().text());
    assert.equal((await edited.json()).followUp.assignedTo, ids.manager);
    assert.equal((await request(`/${unassignedId}`, "PUT", { assignedTo: null })).status, 200);
    assert.equal((await (await request("/summary?owner=unassigned")).json()).overdue, 1);
    assert.equal(logs.length, 6);
});
