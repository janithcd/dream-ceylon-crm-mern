const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
process.env.AUTH_RATE_LIMIT_MAX = "1000";
const app = require("../app");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const { getDepartureReadinessQuery, summarizeDepartureReadiness } = require("../utils/departureReadiness");

const example = () => ({
    _id: "507f1f77bcf86cd799439201", bookingCode: "DCJ-READY-TEST", bookingStatus: "Confirmed",
    customer: { fullName: "Booking Contact", email: "PRIVATE-CONTACT@example.invalid" },
    travelStartDate: new Date("2027-04-01"), numberOfTravelers: 2,
    travelerNames: ["PRIVATE-FIRST", "PRIVATE-SECOND"], travelerRosterVersion: 1,
    hotelStays: [
        { status: "Confirmed", rooms: 1, roomingPlan: { assignments: ["1", "1"], rosterVersion: 1, roomCount: 1 } },
        { status: "Requested" }, { status: "Cancelled" },
    ],
    transportAssignments: [{ status: "Requested" }, { status: "Cancelled" }],
    preparationTasks: [{ completedAt: null }, { completedAt: new Date() }],
    totalPrice: 1000000, adminNotes: "PRIVATE-NOTE",
});

test("departure query respects Colombo day boundaries and excludes inactive trips", () => {
    const query = getDepartureReadinessQuery(new Date("2026-10-16T19:00:00Z"));
    assert.equal(query.travelStartDate.$gte.toISOString(), "2026-10-16T18:30:00.000Z");
    assert.equal(query.travelStartDate.$lte.toISOString(), "2026-11-16T18:29:59.999Z");
    assert.deepEqual(query.bookingStatus.$in, ["Pending", "Confirmed", "In Progress"]);
});

test("queue distinguishes action, optional plan review and no recorded gaps without leaking names", () => {
    const booking = example();
    const active = summarizeDepartureReadiness(booking);
    assert.equal(active.status, "attention");
    assert.equal(active.pendingHotelCount, 1);
    assert.equal(active.pendingTransportCount, 1);
    assert.equal(active.openTaskCount, 1);
    assert.equal(active.missingTravelerCount, 0);
    assert.ok(!JSON.stringify(active).includes("PRIVATE"));
    assert.ok(!JSON.stringify(active).includes("1000000"));

    booking.hotelStays[1].status = "Confirmed";
    booking.hotelStays[1].rooms = 1;
    booking.transportAssignments[0].status = "Confirmed";
    booking.preparationTasks = [];
    assert.equal(summarizeDepartureReadiness(booking).status, "review");
    assert.equal(summarizeDepartureReadiness(booking).missingRoomingCount, 1);
    booking.hotelStays[1].roomingPlan = { assignments: ["1", "1"], rosterVersion: 1, roomCount: 1 };
    assert.equal(summarizeDepartureReadiness(booking).status, "recorded-clear");
    booking.travelerRosterVersion = 2;
    assert.equal(summarizeDepartureReadiness(booking).staleRoomingCount, 2);
    assert.equal(summarizeDepartureReadiness(booking).status, "attention");
    booking.travelerNames = ["PRIVATE-FIRST"];
    assert.equal(summarizeDepartureReadiness(booking).missingTravelerCount, 1);
    booking.hotelStays.forEach((stay) => { stay.status = "Cancelled"; });
    assert.equal(summarizeDepartureReadiness(booking).missingRoomingCount, 0);
});

test("queue API enforces booking permission, paginates and returns a safe summary", async (t) => {
    const id = "507f1f77bcf86cd799439202";
    const deniedId = "507f1f77bcf86cd799439203";
    let reads = 0;
    t.mock.method(Admin, "findById", (value) => ({ select: async () => ({
        _id: value, role: String(value) === deniedId ? "No booking access" : "Viewer", status: "Active", tokenVersion: 0,
    }) }));
    t.mock.method(Booking, "find", () => {
        reads += 1;
        return { select: (projection) => {
            assert.match(projection, /travelerRosterVersion/);
            assert.match(projection, /hotelStays\.roomingPlan/);
            return { sort: () => ({ skip: (offset) => ({ limit: () => ({ lean: async () => {
                assert.equal(offset, 20);
                return [example()];
            } }) }) }) };
        } };
    });
    t.mock.method(Booking, "countDocuments", async () => 23);
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}/api/bookings/departure-readiness`;
    const request = (path, authorized = true, adminId = id) => fetch(path, { headers: authorized ? {
        Authorization: `Bearer ${jwt.sign({ id: adminId, v: 0 }, process.env.JWT_SECRET)}`,
    } : {} });
    assert.equal((await request(url, false)).status, 401);
    assert.equal((await request(url, true, deniedId)).status, 403);
    assert.equal((await request(`${url}?page=0`)).status, 400);
    assert.equal(reads, 0);
    const response = await request(`${url}?page=2`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    assert.equal(body.total, 23);
    assert.equal(body.page, 2);
    assert.equal(body.totalPages, 2);
    assert.equal(body.items[0].status, "attention");
    assert.ok(!JSON.stringify(body).includes("PRIVATE"));
    assert.ok(!JSON.stringify(body).includes("1000000"));
});
