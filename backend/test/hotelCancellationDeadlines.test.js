const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
const app = require("../app");
const Booking = require("../models/Booking");
const Admin = require("../models/Admin");
const { buildHotelDeadlinePipeline } = require("../utils/hotelCancellationDeadlines");

test("hotel deadline queue selects active stays by Sri Lanka cutoff and paginates", () => {
    const now = new Date("2026-10-22T19:00:00Z"); // Oct 23 in Colombo.
    const pipeline = buildHotelDeadlinePipeline({ filter: "due7", page: 2 }, now);
    assert.deepEqual(pipeline[0].$match.bookingStatus.$in, ["Pending", "Confirmed", "In Progress"]);
    assert.deepEqual(pipeline[0].$match.hotelStays.$elemMatch.status.$in, ["Requested", "Confirmed"]);
    assert.equal(pipeline[0].$match.hotelStays.$elemMatch.checkInDate.$gte.toISOString(), "2026-10-22T18:30:00.000Z");
    assert.deepEqual(pipeline.at(-1).$facet.items[0].$match, {
        cancellationDeadline: { $lt: new Date("2026-10-29T18:30:00.000Z") },
    });
    assert.equal(pipeline.at(-1).$facet.items.at(-2).$skip, 25);
    assert.deepEqual(buildHotelDeadlinePipeline({ filter: "overdue" }, now).at(-1).$facet.total[0].$match,
        { cancellationDeadline: { $lt: new Date("2026-10-22T18:30:00.000Z") } });
    assert.deepEqual(buildHotelDeadlinePipeline({ filter: "later" }, now).at(-1).$facet.total[0].$match,
        { cancellationDeadline: { $gte: new Date("2026-10-29T18:30:00.000Z") } });
});

test("hotel deadline endpoint enforces booking view and validates pagination", async (t) => {
    const viewerId = "507f1f77bcf86cd799439081";
    const blockedId = "507f1f77bcf86cd799439082";
    let calls = 0;
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({
        _id: id, role: String(id) === blockedId ? "Unknown Role" : "Viewer", status: "Active", tokenVersion: 0,
    }) }));
    t.mock.method(Booking, "aggregate", async () => {
        calls += 1;
        return [{ summary: [{ total: 3, overdue: 1, dueSoon: 1, later: 1 }], total: [{ value: 2 }],
            items: [{ hotelName: "Test Hotel", bookingCode: "DCJ-1" }] }];
    });
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}/api/bookings/hotel-cancellation-deadlines`;
    const request = (query, id) => fetch(`${url}${query}`, {
        headers: id ? { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` } : {},
    });
    assert.equal((await request("")).status, 401);
    assert.equal((await request("", blockedId)).status, 403);
    for (const query of ["?filter=missing", "?page=0", "?page=1.5", "?page=1001"]) {
        assert.equal((await request(query, viewerId)).status, 400);
    }
    assert.equal(calls, 0);
    const response = await request("?filter=due7&page=1", viewerId);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.total, 2);
    assert.equal(body.summary.overdue, 1);
    assert.equal(body.items[0].hotelName, "Test Hotel");
    assert.equal(calls, 1);
});
