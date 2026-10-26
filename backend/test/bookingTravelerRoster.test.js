const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
process.env.AUTH_RATE_LIMIT_MAX = "1000";

const app = require("../app");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const ActivityLog = require("../models/ActivityLog");
const { parseTravelerNames } = require("../utils/travelerRoster");

const makeBooking = () => new Booking({
    _id: "507f1f77bcf86cd799439081",
    bookingCode: "DCJ-TEST-ROSTER",
    customer: { fullName: "Booking Contact", email: "contact@example.test", whatsappNumber: "+94771234567", country: "UK" },
    travelStartDate: new Date("2027-03-01"), travelEndDate: new Date("2027-03-10"),
    numberOfTravelers: 2, totalPrice: 1000,
});

test("traveler names are trimmed and checked against booking count and field limits", async () => {
    assert.deepEqual(parseTravelerNames(["  Maria  Lee  ", "José"], 2), { names: ["Maria Lee", "José"] });
    for (const names of [null, "Maria", [""], [123], ["Name\nPassport"], ["A".repeat(121)], ["A", "B", "C"]]) {
        assert.ok(parseTravelerNames(names, 2).error);
    }
    const booking = makeBooking();
    booking.travelerNames = ["Maria Lee", "José"];
    await booking.validate();
    booking.numberOfTravelers = 1;
    await assert.rejects(booking.validate(), /Named travelers cannot exceed/);
    booking.numberOfTravelers = 80;
    booking.travelerNames = Array(61).fill("Name");
    await assert.rejects(booking.validate(), /at most 60 named travelers/);
});

test("roster API checks permissions, stale versions, headcount changes and history privacy", async (t) => {
    const booking = makeBooking();
    const salesId = "507f1f77bcf86cd799439082";
    const viewerId = "507f1f77bcf86cd799439083";
    const logs = [];
    let changeHeadcountDuringWrite = false;
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({
        _id: id, role: String(id) === viewerId ? "Viewer" : "Sales", status: "Active", tokenVersion: 0,
    }) }));
    t.mock.method(Booking, "findById", async (id) => String(id) === String(booking._id) ? booking : null);
    t.mock.method(Booking, "findOneAndUpdate", async (query, update) => {
        const expectedVersion = typeof query.travelerRosterVersion === "object" ? 0 : query.travelerRosterVersion;
        if (changeHeadcountDuringWrite) {
            booking.numberOfTravelers = 4;
            changeHeadcountDuringWrite = false;
        }
        if (query.numberOfTravelers !== booking.numberOfTravelers || expectedVersion !== booking.travelerRosterVersion) return null;
        booking.travelerNames = update.$set.travelerNames;
        booking.travelerRosterVersion += update.$inc.travelerRosterVersion;
        return booking;
    });
    t.mock.method(ActivityLog, "create", async (entry) => { logs.push(entry); return entry; });

    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}/api/bookings/${booking._id}/travelers`;
    const request = (method, id, body, path = url) => fetch(path, {
        method,
        headers: id ? { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}`, "Content-Type": "application/json" } : {},
        body: body === undefined ? undefined : JSON.stringify(body),
    });

    assert.equal((await request("GET")).status, 401);
    const read = await request("GET", viewerId);
    assert.equal(read.status, 200);
    assert.equal(read.headers.get("cache-control"), "no-store");
    assert.deepEqual((await read.json()).travelerNames, []);
    assert.equal((await request("PUT", viewerId, { expectedVersion: 0, expectedHeadcount: 2, travelerNames: ["Maria"] })).status, 403);
    assert.equal((await request("PUT", salesId, { expectedVersion: "0", expectedHeadcount: 2, travelerNames: ["Maria"] })).status, 400);
    assert.equal((await request("PUT", salesId, { expectedVersion: 0, expectedHeadcount: 2, travelerNames: ["Maria", "José", "Third"] })).status, 400);

    const saved = await request("PUT", salesId, { expectedVersion: 0, expectedHeadcount: 2, travelerNames: ["  Maria  Lee ", " José "] });
    assert.equal(saved.status, 200, await saved.clone().text());
    assert.equal(saved.headers.get("cache-control"), "no-store");
    assert.deepEqual((await saved.json()).travelerNames, ["Maria Lee", "José"]);
    assert.equal(booking.travelerRosterVersion, 1);
    assert.equal((await request("PUT", salesId, { expectedVersion: 0, expectedHeadcount: 2, travelerNames: ["Overwritten"] })).status, 409);
    assert.deepEqual(booking.travelerNames, ["Maria Lee", "José"]);
    assert.equal((await request("PUT", salesId, { numberOfTravelers: 1 }, url.replace(/\/travelers$/, ""))).status, 400);
    assert.equal(booking.numberOfTravelers, 2);

    // Simulate a separate booking edit after the roster was loaded.
    const oldVersion = booking.travelerRosterVersion;
    booking.numberOfTravelers = 3;
    assert.equal((await request("PUT", salesId, { expectedVersion: oldVersion, expectedHeadcount: 2, travelerNames: ["Maria Lee", "José"] })).status, 409);
    changeHeadcountDuringWrite = true;
    assert.equal((await request("PUT", salesId, { expectedVersion: oldVersion, expectedHeadcount: 3, travelerNames: ["Maria Lee", "José", "Third"] })).status, 409);
    const stale = await request("PUT", salesId, { expectedVersion: oldVersion, expectedHeadcount: 4, travelerNames: ["Maria Lee", "José", "Third"] });
    assert.equal(stale.status, 200, await stale.clone().text());
    assert.equal((await request("PUT", salesId, { expectedVersion: oldVersion, expectedHeadcount: 4, travelerNames: [] })).status, 409);
    assert.equal((await request("GET", salesId, undefined, url.replace(String(booking._id), "bad"))).status, 400);
    assert.equal((await request("GET", salesId, undefined, url.replace(String(booking._id), "507f1f77bcf86cd799439099"))).status, 404);
    assert.equal(logs.length, 2);
    assert.ok(!JSON.stringify(logs).includes("Maria Lee"));
    assert.deepEqual(logs.map((log) => log.metadata.namedTravelerCount), [2, 3]);
});
