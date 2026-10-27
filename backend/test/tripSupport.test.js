const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
process.env.AUTH_RATE_LIMIT_MAX = "1000";
const app = require("../app");
const Booking = require("../models/Booking");
const Admin = require("../models/Admin");
const ActivityLog = require("../models/ActivityLog");
const { getBusinessDayBounds } = require("../utils/businessDate");
const { activeTripQuery, buildTripSupportQuery, isActiveTrip, summarizeTripSupport, parseNewIssue, parseIssueAction } = require("../utils/tripSupport");

const DAY_MS = 86400000;
const todayInput = () => new Date(getBusinessDayBounds().start.getTime() + 330 * 60000).toISOString().slice(0, 10);
const nextInput = () => new Date(getBusinessDayBounds().start.getTime() + DAY_MS + 330 * 60000).toISOString().slice(0, 10);
const makeBooking = () => new Booking({
    _id: "507f1f77bcf86cd799439321", bookingCode: "DCJ-TRIP-SUPPORT", bookingStatus: "In Progress",
    customer: { fullName: "Private Guest", email: "PRIVATE@example.invalid", whatsappNumber: "+447700900123", country: "UK" },
    travelStartDate: new Date(todayInput()), travelEndDate: new Date(todayInput()),
    numberOfTravelers: 2, totalPrice: 2100, adminNotes: "PRIVATE-BOOKING-NOTES",
});

test("the active trip window follows Sri Lanka days and open issues remain visible after travel", () => {
    const now = new Date("2026-10-26T19:00:00Z"); // Oct 27 in Colombo
    const active = activeTripQuery(now);
    assert.equal(active.travelStartDate.$lte.toISOString(), "2026-10-27T18:29:59.999Z");
    assert.equal(active.travelEndDate.$gte.toISOString(), "2026-10-26T18:30:00.000Z");
    assert.equal(buildTripSupportQuery("open", now)["tripIssues.status"], "Open");
    assert.equal(buildTripSupportQuery("all", now).$or.length, 2);
    assert.deepEqual(buildTripSupportQuery("mine", now, "507f1f77bcf86cd799439322").tripIssues.$elemMatch,
        { status: "Open", assignedTo: "507f1f77bcf86cd799439322" });
    assert.deepEqual(buildTripSupportQuery("unassigned", now).tripIssues.$elemMatch, { status: "Open", assignedTo: null });
    const booking = makeBooking();
    assert.equal(isActiveTrip(booking), true);
    booking.bookingStatus = "Completed";
    assert.equal(isActiveTrip(booking), false);
    booking.tripIssues.push({ title: "Vehicle arrived late", category: "Transport", priority: "Urgent",
        openedAt: now, events: [{ action: "opened", note: "Pickup was delayed", at: now }] });
    const summary = summarizeTripSupport(booking);
    assert.equal(summary.urgentIssueCount, 1);
    assert.equal(summary.unscheduledIssueCount, 1);
    assert.equal(summary.unassignedIssueCount, 1);
    booking.tripIssues[0].assignedTo = "507f1f77bcf86cd799439322";
    booking.tripIssues[0].assignedToName = "Agent";
    assert.equal(summarizeTripSupport(booking, now, "507f1f77bcf86cd799439322").myIssueCount, 1);
    booking.tripIssues[0].nextFollowUpDate = new Date("2026-10-26T00:00:00Z");
    assert.equal(summarizeTripSupport(booking, now).overdueIssueCount, 1);
    for (const privateValue of ["Vehicle arrived late", "Pickup was delayed", "PRIVATE-BOOKING-NOTES", "PRIVATE@example.invalid", "2100"]) {
        assert.ok(!JSON.stringify(summary).includes(privateValue));
    }
});

test("issue input requires an actual description and checks follow-up dates; status updates remain explicit", () => {
    const now = new Date("2026-10-26T19:00:00Z");
    const body = { title: " Vehicle arrived late ", category: "Transport", priority: "Urgent",
        note: " Guest waited at airport ", nextFollowUpDate: "2026-10-28" };
    assert.ok(parseNewIssue({ ...body, category: "Finance" }, "Agent", now).error);
    assert.ok(parseNewIssue({ ...body, nextFollowUpDate: "2026-10-26" }, "Agent", now).error);
    assert.ok(parseNewIssue({ ...body, note: "" }, "Agent", now).error);
    assert.ok(parseNewIssue({ ...body, nextFollowUpDate: "2026-02-30" }, "Agent", now).error);
    const issue = parseNewIssue(body, "Agent", now).value;
    assert.equal(issue.title, "Vehicle arrived late");
    assert.equal(issue.events[0].note, "Guest waited at airport");
    assert.ok(parseIssueAction({ action: "resolved", note: "Done", expectedRevision: 0, nextFollowUpDate: null }, issue, "Agent", now).error);
    assert.ok(parseIssueAction({ action: "resolved", note: "Driver apologized", expectedRevision: 0, nextFollowUpDate: "2026-10-28" }, issue, "Agent", now).error);
    const resolved = parseIssueAction({ action: "resolved", note: "Driver apologized to guest", expectedRevision: 0, nextFollowUpDate: null }, issue, "Agent", now).value;
    assert.equal(resolved.status, "Resolved");
    assert.equal(resolved.nextFollowUpDate, null);
    assert.ok(parseIssueAction({ action: "updated", note: "Still open", expectedRevision: 1, nextFollowUpDate: null }, { status: "Resolved" }, "Agent", now).error);
    assert.equal(parseIssueAction({ action: "reopened", note: "Guest requested more help", expectedRevision: 1, nextFollowUpDate: null }, { status: "Resolved" }, "Agent", now).value.status, "Open");
});

test("trip issue API enforces permissions, atomic revisions and separate read-only queue details", async (t) => {
    const booking = makeBooking();
    const sales = "507f1f77bcf86cd799439322";
    const viewer = "507f1f77bcf86cd799439323";
    const superAdmin = "507f1f77bcf86cd799439324";
    const teammate = "507f1f77bcf86cd799439325";
    const inactive = "507f1f77bcf86cd799439326";
    const logs = [];
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({
        _id: id, name: String(id) === teammate ? "Teammate" : "Agent",
        role: String(id) === viewer ? "Viewer" : String(id) === superAdmin ? "Super Admin" : "Sales",
        status: String(id) === inactive ? "Inactive" : "Active", tokenVersion: 0,
    }) }));
    t.mock.method(Booking, "findById", (id) => {
        const result = String(id) === String(booking._id) ? booking : null;
        return { select: async () => result, then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) };
    });
    t.mock.method(Booking, "exists", async ({ _id }) => String(_id) === String(booking._id));
    t.mock.method(Booking, "countDocuments", async () => 1);
    t.mock.method(Booking, "find", () => ({ select() { return this; }, sort() { return this; }, skip() { return this; },
        limit() { return this; }, lean: async () => [booking.toObject()] }));
    t.mock.method(Booking, "findOneAndUpdate", async (query, update) => {
        if (String(query._id) !== String(booking._id)) return null;
        if (update.$push?.tripIssues) {
            if (!isActiveTrip(booking)) return null;
            booking.tripIssues.push(update.$push.tripIssues);
            return booking;
        }
        const { _id, revision, status } = query.tripIssues.$elemMatch;
        const issue = booking.tripIssues.id(_id);
        if (!issue || issue.revision !== revision || issue.status !== status) return null;
        if (Object.hasOwn(update.$set, "tripIssues.$.assignedTo")) {
            issue.assignedTo = update.$set["tripIssues.$.assignedTo"];
            issue.assignedToName = update.$set["tripIssues.$.assignedToName"];
        } else {
            issue.status = update.$set["tripIssues.$.status"];
            issue.resolvedAt = update.$set["tripIssues.$.resolvedAt"];
            issue.nextFollowUpDate = update.$set["tripIssues.$.nextFollowUpDate"];
        }
        issue.revision += 1;
        issue.events.push(update.$push["tripIssues.$.events"].$each[0]);
        return booking;
    });
    t.mock.method(ActivityLog, "create", async (entry) => { logs.push(entry); return entry; });
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}/api/bookings`;
    const request = (path, admin, method = "GET", body) => fetch(`${base}${path}`, { method, headers: admin ? {
        Authorization: `Bearer ${jwt.sign({ id: admin, v: 0 }, process.env.JWT_SECRET)}`,
        "Content-Type": "application/json",
    } : {}, body: body === undefined ? undefined : JSON.stringify(body) });
    assert.equal((await request("/trip-support", null)).status, 401);
    assert.equal((await request("/trip-support?filter=nope", sales)).status, 400);
    const queue = await request("/trip-support?filter=active", viewer);
    assert.equal(queue.status, 200);
    assert.equal(queue.headers.get("cache-control"), "no-store");
    assert.ok(!JSON.stringify(await queue.json()).includes("PRIVATE@example.invalid"));
    const path = `/${booking._id}/trip-issues`;
    const body = { title: "Vehicle arrived late", category: "Transport", priority: "Urgent",
        note: "Pickup was delayed", nextFollowUpDate: nextInput() };
    assert.equal((await request(path, viewer, "POST", body)).status, 403);
    assert.equal((await request(path, sales, "POST", { ...body, priority: "Critical" })).status, 400);
    const added = await request(path, sales, "POST", body);
    assert.equal(added.status, 201, await added.clone().text());
    const issueId = (await added.json()).issue._id;
    assert.equal(String(booking.tripIssues[0].assignedTo), sales);
    assert.equal((await request(`/${booking._id}`, superAdmin, "DELETE")).status, 409);
    const read = await request(path, viewer);
    assert.equal(read.status, 200);
    assert.equal((await read.json()).issues[0].events[0].note, "Pickup was delayed");
    const ownerPath = `${path}/${issueId}/assignee`;
    assert.equal((await request(ownerPath, viewer, "PATCH", { assignedTo: null, expectedRevision: 0 })).status, 403);
    assert.equal((await request(ownerPath, sales, "PATCH", { assignedTo: viewer, expectedRevision: 0 })).status, 400);
    assert.equal((await request(ownerPath, sales, "PATCH", { assignedTo: inactive, expectedRevision: 0 })).status, 400);
    const unassign = await request(ownerPath, sales, "PATCH", { assignedTo: null, expectedRevision: 0 });
    assert.equal(unassign.status, 200, await unassign.clone().text());
    assert.equal(booking.tripIssues[0].assignedTo, null);
    assert.equal((await request(ownerPath, sales, "PATCH", { assignedTo: teammate, expectedRevision: 0 })).status, 409);
    const assigned = await request(ownerPath, sales, "PATCH", { assignedTo: teammate, expectedRevision: 1 });
    assert.equal(assigned.status, 200, await assigned.clone().text());
    assert.equal(booking.tripIssues[0].assignedToName, "Teammate");
    assert.equal((await request(`${path}/${issueId}`, viewer, "PATCH", { action: "resolved", note: "Driver apologized to guest", nextFollowUpDate: null, expectedRevision: 0 })).status, 403);
    const updated = await request(`${path}/${issueId}`, sales, "PATCH", { action: "updated", note: "Driver is on the way", nextFollowUpDate: null, expectedRevision: 2 });
    assert.equal(updated.status, 200, await updated.clone().text());
    assert.equal((await request(`${path}/${issueId}`, sales, "PATCH", { action: "resolved", note: "Driver apologized to guest", nextFollowUpDate: null, expectedRevision: 0 })).status, 409);
    booking.bookingStatus = "Completed";
    assert.equal((await request(path, sales, "POST", body)).status, 409);
    const resolved = await request(`${path}/${issueId}`, sales, "PATCH", { action: "resolved", note: "Driver apologized to guest", nextFollowUpDate: null, expectedRevision: 3 });
    assert.equal(resolved.status, 200, await resolved.clone().text());
    assert.equal((await resolved.json()).issue.status, "Resolved");
    assert.equal((await request(ownerPath, sales, "PATCH", { assignedTo: sales, expectedRevision: 4 })).status, 409);
    assert.equal(logs.length, 5);
    assert.ok(!JSON.stringify(logs).includes("Pickup was delayed"));
    assert.ok(!JSON.stringify(logs).includes("Driver apologized"));
    assert.ok(!JSON.stringify(logs).includes("Vehicle arrived late"));
});
