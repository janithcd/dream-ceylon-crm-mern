const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
const app = require("../app");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const BookingHandoverRead = require("../models/BookingHandoverRead");

test("handover worklist is authorized, paged, and exposes metadata only", async (t) => {
    const viewerId = "507f1f77bcf86cd799439901";
    const noAccessId = "507f1f77bcf86cd799439902";
    const bookingId = "507f1f77bcf86cd799439903";
    const pipelines = [];
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({
        _id: id, role: String(id) === noAccessId ? "Unknown Role" : "Viewer",
        status: "Active", tokenVersion: 0,
    }) }));
    t.mock.method(Booking, "aggregate", async (pipeline) => {
        pipelines.push(pipeline);
        return [{ items: [{ bookingId, bookingCode: "DCJ-901", bookingStatus: "Confirmed",
            travelStartDate: new Date("2027-03-01"), noteCount: 2, unreadCount: 1, lastNoteAt: new Date(),
            lastAuthor: "Casey", text: "PRIVATE NOTE", customer: { email: "PRIVATE EMAIL" }, totalPrice: 5000 }],
        total: [{ value: 25 }] }];
    });
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}/api/bookings/handover-worklist`;
    const auth = (id) => ({ Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` });
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: auth(noAccessId) })).status, 403);
    for (const query of ["?page=0", "?page=1.5", "?page=10001", "?filter=private"]) {
        assert.equal((await fetch(url + query, { headers: auth(viewerId) })).status, 400);
    }
    assert.equal(pipelines.length, 0);
    const activeResponse = await fetch(`${url}?page=2`, { headers: auth(viewerId) });
    assert.equal(activeResponse.status, 200);
    assert.equal(activeResponse.headers.get("cache-control"), "no-store");
    const active = await activeResponse.json();
    assert.equal(active.total, 25);
    assert.equal(active.totalPages, 2);
    assert.equal(active.items[0].bookingId, bookingId);
    assert.equal(active.items[0].unreadCount, 1);
    assert.equal(JSON.stringify(active).includes("PRIVATE"), false);
    assert.equal(JSON.stringify(active).includes("5000"), false);
    assert.deepEqual(pipelines[0][0].$match, { "handoverNotes.0": { $exists: true },
        bookingStatus: { $in: ["Pending", "Confirmed", "In Progress"] } });
    assert.equal(pipelines[0][2].$lookup.from, BookingHandoverRead.collection.name);
    assert.equal(String(pipelines[0][2].$lookup.pipeline[0].$match.$expr.$and[1].$eq[1]), viewerId);
    assert.equal(pipelines[0][5].$facet.items[0].$skip, 20);
    assert.equal(pipelines[0][5].$facet.items[1].$limit, 20);
    assert.deepEqual(pipelines[0][4].$sort, { "lastNote.createdAt": -1, _id: -1 });
    const all = await (await fetch(`${url}?filter=all`, { headers: auth(viewerId) })).json();
    assert.equal(all.filter, "all");
    assert.equal(pipelines[1][0].$match.bookingStatus, undefined);
    const unread = await (await fetch(`${url}?filter=unread`, { headers: auth(viewerId) })).json();
    assert.equal(unread.filter, "unread");
    assert.deepEqual(pipelines[2][4].$match, { unreadCount: { $gt: 0 } });
    assert.deepEqual(pipelines[2][0].$match.bookingStatus.$in, ["Pending", "Confirmed", "In Progress"]);
});
