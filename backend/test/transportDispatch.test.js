const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
const app = require("../app");
const Booking = require("../models/Booking");
const Admin = require("../models/Admin");
const { parseTransportDispatchFilters, buildTransportDispatchPipeline } = require("../utils/transportDispatch");

test("dispatch range follows Sri Lanka's calendar day and accepts up to 31 days", () => {
    const before = parseTransportDispatchFilters({}, new Date("2026-12-31T18:29:59Z")).value;
    const after = parseTransportDispatchFilters({}, new Date("2026-12-31T18:30:00Z")).value;
    assert.deepEqual([before.from, before.to], ["2026-12-31", "2027-01-06"]);
    assert.deepEqual([after.from, after.to], ["2027-01-01", "2027-01-07"]);
    assert.equal(parseTransportDispatchFilters({ from: "2028-02-29", to: "2028-02-29" }).error, undefined);
    assert.equal(parseTransportDispatchFilters({ from: "2027-03-01", to: "2027-03-31" }).error, undefined);
    for (const query of [{ from: "" }, { from: null }, { from: ["2027-03-01"] }, { from: "bad" },
        { from: "2027-02-29" }, { to: "2027-02-30" }, { from: "2027-03-02", to: "2027-03-01" },
        { from: "2027-03-01", to: "2027-04-01" }, { filter: "Cancelled" }, { filter: ["all"] },
        { page: "0" }, { page: "1.5" }, { page: "10001" }, { page: ["1"] }, { page: "" }]) {
        assert.ok(parseTransportDispatchFilters(query).error, JSON.stringify(query));
    }
});

test("dispatch matches overlapping assignments, checks confirmed details, and projects only operational fields", () => {
    const input = parseTransportDispatchFilters({ from: "2027-03-05", to: "2027-03-07", filter: "attention", page: "2" }).value;
    const pipeline = buildTransportDispatchPipeline(input);
    assert.deepEqual(pipeline[0].$match.bookingStatus.$in, ["Pending", "Confirmed", "In Progress"]);
    const match = pipeline[0].$match.transportAssignments.$elemMatch;
    assert.deepEqual(match.status.$in, ["Requested", "Confirmed"]);
    assert.equal(match.startDate.$lte.toISOString(), "2027-03-07T18:29:59.999Z");
    assert.equal(match.endDate.$gte.toISOString(), "2027-03-04T18:30:00.000Z");
    assert.deepEqual(pipeline[2].$match["transportAssignments.startDate"], match.startDate);
    assert.equal(pipeline[3].$project.notes, undefined);
    assert.equal(pipeline[3].$project.contacts, undefined);
    assert.equal(pipeline[3].$project.customer, undefined);
    assert.equal(pipeline[3].$project.totalPrice, undefined);
    assert.equal(pipeline[3].$project.chauffeurPhone, "$transportAssignments.chauffeurPhone");
    const lookup = pipeline.find((stage) => stage.$lookup).$lookup;
    assert.equal(lookup.localField, "vehicleLookupKey");
    assert.equal(lookup.foreignField, "transportAssignments.registrationKey");
    assert.deepEqual(lookup.pipeline[0].$match.bookingStatus.$in, ["Pending", "Confirmed", "In Progress"]);
    assert.equal(lookup.pipeline[2].$match["transportAssignments.status"], "Confirmed");
    assert.deepEqual(lookup.pipeline[2].$match.$expr.$and[0],
        { $eq: ["$transportAssignments.registrationKey", "$$vehicleKey"] });
    assert.deepEqual(Object.keys(lookup.pipeline.at(-2).$project).sort(),
        ["_id", "assignmentId", "bookingCode", "bookingId", "endDate", "route", "startDate"]);
    assert.deepEqual(pipeline.at(-1).$facet.items.at(-1).$project, { sortTime: 0, registrationKey: 0, vehicleLookupKey: 0 });
    const clash = buildTransportDispatchPipeline({ ...input, filter: "conflicts" }).at(-1).$facet;
    assert.deepEqual(clash.items[0], { $match: { vehicleConflict: true } });
    assert.deepEqual(clash.total[0], clash.items[0]);
    assert.deepEqual(pipeline.at(-1).$facet.items[0], { $match: { needsAttention: true } });
    assert.deepEqual(pipeline.at(-1).$facet.total[0], { $match: { needsAttention: true } });
    assert.equal(pipeline.at(-1).$facet.items.at(-2).$limit, 20);
    assert.equal(pipeline.at(-1).$facet.items.at(-3).$skip, 20);
});

test("dispatch endpoint requires booking access, validates filters and handles an empty range", async (t) => {
    const viewerId = "507f1f77bcf86cd799439601", blockedId = "507f1f77bcf86cd799439602";
    let calls = 0, fail = false;
    let result = [{ items: [{ bookingCode: "DCJ-TEST", route: "Tour" }],
        total: [{ value: 21 }], summary: [{ total: 24, requested: 22, attention: 23, conflicts: 3, missingDriver: 1 }] }];
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({ _id: id,
        role: String(id) === blockedId ? "Unknown Role" : "Viewer", status: "Active", tokenVersion: 0 }) }));
    t.mock.method(Booking, "aggregate", async () => { calls++; if (fail) throw new Error("synthetic unavailable database"); return result; });
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}/api/bookings/transport-dispatch`;
    const request = (suffix, id) => fetch(url + suffix, { headers: id ? { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` } : {} });
    assert.equal((await request("")).status, 401);
    assert.equal((await request("", blockedId)).status, 403);
    for (const suffix of ["?from=bad", "?filter=other", "?page=0", "?page=1&page=2"]) assert.equal((await request(suffix, viewerId)).status, 400);
    assert.equal(calls, 0);
    const response = await request("?from=2027-03-05&to=2027-03-07&filter=attention&page=2", viewerId);
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
    const data = await response.json();
    assert.equal(data.page, 2); assert.equal(data.total, 21); assert.equal(data.totalPages, 2);
    assert.equal(data.summary.total, 24); assert.equal(data.summary.missingVehicle, 0);
    assert.equal(data.summary.conflicts, 3);
    assert.equal(data.items[0].route, "Tour");
    result = [{ items: [], total: [], summary: [] }];
    const empty = await (await request("?filter=all", viewerId)).json();
    assert.equal(empty.total, 0); assert.equal(empty.totalPages, 1);
    assert.deepEqual(empty.summary, { total: 0, requested: 0, attention: 0, missingDriver: 0, missingVehicle: 0, missingPickup: 0, conflicts: 0 });
    fail = true;
    assert.equal((await request("", viewerId)).status, 500);
});
