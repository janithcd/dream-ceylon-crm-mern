const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
process.env.AUTH_RATE_LIMIT_MAX = "1000";

const app = require("../app");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const ActivityLog = require("../models/ActivityLog");
const { parseRoomingAssignments, roomingPlanState } = require("../utils/roomingPlan");

const makeBooking = () => new Booking({
    _id: "507f1f77bcf86cd799439221", bookingCode: "DCJ-PLAN-TEST", bookingStatus: "Confirmed",
    customer: { fullName: "Booking Contact", email: "contact@example.test", whatsappNumber: "+94771234567", country: "UK" },
    travelStartDate: "2027-03-10", travelEndDate: "2027-03-13", numberOfTravelers: 2,
    travelerNames: ["First Guest", "Second Guest"], totalPrice: 1000,
    hotelStays: [{ _id: "507f1f77bcf86cd799439222", hotelName: "Test Hotel",
        checkInDate: "2027-03-11", checkOutDate: "2027-03-12", rooms: 1,
        status: "Confirmed", supplierEmail: "hotel@example.test" }],
});

test("plan validation requires a choice per person and an occupant in each reserved room", () => {
    assert.deepEqual(parseRoomingAssignments(["1", "not-staying"], 2, 1),
        { assignments: ["1", "not-staying"], includedCount: 1 });
    for (const assignments of [[], ["1", ""], ["not-staying", "not-staying"],
        ["1", "2"], ["0", "1"], ["01", "1"], [1, "not-staying"]]) {
        assert.ok(parseRoomingAssignments(assignments, 2, 1).error, JSON.stringify(assignments));
    }
    assert.ok(parseRoomingAssignments(["1", "1"], 2, 2).error);
    assert.equal(parseRoomingAssignments(["1", "2"], 2, 2).includedCount, 2);
});

test("saved plans are hidden when the roster or hotel room count changes", () => {
    const booking = makeBooking();
    const stay = booking.hotelStays[0];
    assert.equal(roomingPlanState(booking, stay).status, "none");
    stay.roomingPlan = { assignments: ["1", "not-staying"], rosterVersion: 0, roomCount: 1,
        savedAt: new Date(), savedByName: "Sales Agent" };
    assert.deepEqual(roomingPlanState(booking, stay).assignments, ["1", "not-staying"]);
    booking.travelerRosterVersion = 1;
    assert.deepEqual(roomingPlanState(booking, stay).assignments, []);
    assert.equal(roomingPlanState(booking, stay).status, "stale");
    booking.travelerRosterVersion = 0;
    stay.rooms = 2;
    assert.equal(roomingPlanState(booking, stay).status, "stale");
});

test("rooming plan API saves and clears atomically with access and version checks", async (t) => {
    const booking = makeBooking();
    const stay = booking.hotelStays[0];
    const salesId = "507f1f77bcf86cd799439223";
    const viewerId = "507f1f77bcf86cd799439224";
    const logs = [];
    let changeRosterDuringWrite = false;
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({
        _id: id, name: "Sales Agent", role: String(id) === viewerId ? "Viewer" : "Sales",
        status: "Active", tokenVersion: 0,
    }) }));
    t.mock.method(Booking, "findById", async (id) => String(id) === String(booking._id) ? booking : null);
    t.mock.method(Booking, "findOneAndUpdate", async (query, update) => {
        if (changeRosterDuringWrite) { booking.travelerRosterVersion += 1; changeRosterDuringWrite = false; }
        const match = query.hotelStays.$elemMatch;
        const revision = typeof match.roomingRevision === "object" ? 0 : match.roomingRevision;
        const roster = typeof query.travelerRosterVersion === "object" ? 0 : query.travelerRosterVersion;
        if (String(query._id) !== String(booking._id) ||
            (query.travelerRosterVersion !== undefined && booking.travelerRosterVersion !== roster) ||
            (stay.roomingRevision ?? 0) !== revision || stay.status !== "Confirmed" ||
            (match.rooms && match.rooms !== stay.rooms) || (match.roomingPlan && !stay.roomingPlan)) return null;
        stay.roomingPlan = update.$set["hotelStays.$.roomingPlan"];
        stay.roomingRevision += 1;
        return booking;
    });
    t.mock.method(ActivityLog, "create", async (entry) => { logs.push(entry); return entry; });
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}/api/bookings/${booking._id}/hotel-stays/${stay._id}/rooming-plan`;
    const request = (method, id, body, path = url) => fetch(path, {
        method, headers: id ? { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}`,
            "Content-Type": "application/json" } : {},
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const initial = { assignments: ["1", "not-staying"], expectedRosterVersion: 0,
        expectedRooms: 1, expectedRevision: 0 };

    assert.equal((await request("PUT", null, initial)).status, 401);
    assert.equal((await request("PUT", viewerId, initial)).status, 403);
    assert.equal((await request("PUT", salesId, { ...initial, assignments: ["not-staying", "not-staying"] })).status, 400);
    assert.equal((await request("PUT", salesId, { ...initial, expectedRevision: "0" })).status, 400);
    assert.equal((await request("PUT", salesId, initial, url.replace(String(stay._id), "bad"))).status, 400);
    changeRosterDuringWrite = true;
    assert.equal((await request("PUT", salesId, initial)).status, 409);
    assert.equal(stay.roomingPlan, null);
    const refreshed = { ...initial, expectedRosterVersion: 1 };
    const saved = await request("PUT", salesId, refreshed);
    assert.equal(saved.status, 200, await saved.clone().text());
    assert.equal(saved.headers.get("cache-control"), "no-store");
    assert.deepEqual((await saved.json()).roomingPlan.assignments, ["1", "not-staying"]);
    assert.equal(stay.roomingRevision, 1);
    assert.equal((await request("PUT", salesId, refreshed)).status, 409);
    assert.equal((await request("DELETE", viewerId, { expectedRevision: 1 })).status, 403);
    assert.equal((await request("DELETE", salesId, { expectedRevision: 0 })).status, 409);
    const cleared = await request("DELETE", salesId, { expectedRevision: 1 });
    assert.equal(cleared.status, 200, await cleared.clone().text());
    assert.equal((await cleared.json()).roomingPlan.status, "none");
    assert.equal(stay.roomingRevision, 2);
    assert.equal((await request("DELETE", salesId, { expectedRevision: 2 })).status, 409);
    assert.equal(logs.length, 2);
    assert.ok(!JSON.stringify(logs).includes("First Guest"));
    assert.deepEqual(logs[0].metadata.includedCount, 1);
});
