const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
const app = require("../app");
const Booking = require("../models/Booking");
const Admin = require("../models/Admin");
const { parseTransferFilters, buildAirportTransfersPipeline } = require("../utils/airportTransfers");

test("transfer dates default to seven Sri Lanka calendar days across midnight and year boundaries", () => {
    const before = parseTransferFilters({}, new Date("2026-12-31T18:29:59Z")).value;
    const after = parseTransferFilters({}, new Date("2026-12-31T18:30:00Z")).value;
    assert.equal(before.startDate, "2026-12-31");
    assert.equal(before.endDate, "2027-01-06");
    assert.equal(after.startDate, "2027-01-01");
    assert.equal(after.endDate, "2027-01-07");
    assert.equal(parseTransferFilters({ startDate: "2028-02-29", endDate: "2028-02-29" }).error, undefined);
    assert.equal(parseTransferFilters({ startDate: "2027-03-01", endDate: "2027-03-31" }).error, undefined);
});

test("transfer filters reject invalid dates, long ranges and malformed query values", () => {
    for (const query of [
        { startDate: "" }, { startDate: null }, { startDate: ["2027-03-01"] },
        { startDate: "2027-02-29" }, { endDate: "2027-02-30" },
        { startDate: "2027-03-02", endDate: "2027-03-01" },
        { startDate: "2027-03-01", endDate: "2027-04-01" },
        { direction: "arrival" }, { status: "Cancelled" }, { chauffeur: "yes" },
        { page: "0" }, { page: "1.5" }, { page: "10001" }, { page: ["1"] }, { page: "" },
    ]) assert.ok(parseTransferFilters(query).error, JSON.stringify(query));
});

test("transfer pipeline uses pickup date and excludes private booking and supplier fields", () => {
    const parsed = parseTransferFilters({ startDate: "2027-03-01", endDate: "2027-03-02", page: "2" }).value;
    const pipeline = buildAirportTransfersPipeline(parsed);
    const assignment = pipeline[0].$match.transportAssignments.$elemMatch;
    assert.deepEqual(pipeline[0].$match.bookingStatus.$in, ["Pending", "Confirmed", "In Progress"]);
    assert.deepEqual(assignment.status.$in, ["Requested", "Confirmed"]);
    assert.equal(assignment.startDate.$gte.toISOString(), "2027-02-28T18:30:00.000Z");
    assert.equal(assignment.startDate.$lte.toISOString(), "2027-03-02T18:29:59.999Z");
    assert.equal(assignment["flight.date"], undefined);
    const projection = pipeline.find((stage) => stage.$project).$project;
    assert.equal(projection.pickupDate, "$transportAssignments.startDate");
    assert.equal(projection.notes, undefined);
    assert.equal(projection.customer, undefined);
    assert.equal(projection.totalPrice, undefined);
    assert.equal(projection.chauffeurPhone, "$transportAssignments.chauffeurPhone");
    assert.equal(pipeline.at(-1).$facet.items.find((stage) => stage.$skip).$skip, 20);
});

test("airport transfers enforce permissions, validate input and handle empty schedules", async (t) => {
    const viewerId = "507f1f77bcf86cd799439081";
    const blockedId = "507f1f77bcf86cd799439082";
    let aggregateCalls = 0;
    let fail = false;
    let result = [{
        summary: [{ requested: 2, missingChauffeur: 1, missingPickupTime: 3 }],
        total: [{ value: 21 }],
        items: [{ bookingCode: "DCJ-TRANSFER", pickupTime: "23:00" }],
    }];
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({
        _id: id, role: String(id) === blockedId ? "Unknown Role" : "Viewer", status: "Active", tokenVersion: 0,
    }) }));
    t.mock.method(Booking, "aggregate", async () => {
        aggregateCalls += 1;
        if (fail) throw new Error("synthetic unavailable database");
        return result;
    });
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const url = "http://127.0.0.1:" + server.address().port + "/api/bookings/airport-transfers";
    const request = (query, id) => fetch(url + query, {
        headers: id ? { Authorization: "Bearer " + jwt.sign({ id }, process.env.JWT_SECRET) } : {},
    });
    assert.equal((await request("")).status, 401);
    assert.equal((await request("", blockedId)).status, 403);
    for (const query of ["?page=0", "?direction=other", "?startDate=2027-02-30", "?status=Cancelled", "?chauffeur=yes", "?page=1&page=2"]) {
        assert.equal((await request(query, viewerId)).status, 400);
    }
    assert.equal(aggregateCalls, 0);
    const response = await request("?startDate=2027-03-01&endDate=2027-03-07&direction=Departure&status=Requested&chauffeur=missing&page=2", viewerId);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.total, 21);
    assert.equal(body.page, 2);
    assert.equal(body.totalPages, 2);
    assert.equal(body.summary.missingChauffeur, 1);
    assert.equal(body.items[0].pickupTime, "23:00");

    result = [{ items: [], summary: [], total: [] }];
    const empty = await (await request("", viewerId)).json();
    assert.equal(empty.total, 0);
    assert.equal(empty.totalPages, 1);
    assert.deepEqual(empty.summary, { requested: 0, missingChauffeur: 0, missingPickupTime: 0 });
    fail = true;
    const failure = await request("", viewerId);
    assert.equal(failure.status, 500);
    assert.deepEqual(await failure.json(), { message: "Failed to load airport transfers" });
});
