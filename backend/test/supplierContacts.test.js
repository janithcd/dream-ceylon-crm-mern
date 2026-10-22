const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
process.env.AUTH_RATE_LIMIT_MAX = "1000";

const app = require("../app");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const ActivityLog = require("../models/ActivityLog");
const { parseSupplierContact } = require("../utils/supplierContact");

test("contact date validation follows Sri Lanka's calendar day and service date", () => {
    const now = new Date("2026-10-16T19:00:00Z"); // Oct 17 in Colombo
    const service = new Date("2026-10-20T00:00:00Z");
    const valid = parseSupplierContact({ channel: "Phone", note: "  Called hotel  ", nextFollowUpDate: "2026-10-17" }, service, now);
    assert.equal(valid.value.note, "Called hotel");
    assert.equal(valid.value.nextFollowUpDate.toISOString(), "2026-10-17T00:00:00.000Z");
    assert.equal(parseSupplierContact({ channel: "Email", nextFollowUpDate: null }, service, now).value.nextFollowUpDate, null);
    for (const date of ["2026-10-16", "2026-10-21", "2026-02-30", "17/10/2026", 123]) {
        assert.ok(parseSupplierContact({ channel: "Email", nextFollowUpDate: date }, service, now).error, String(date));
    }
    assert.ok(parseSupplierContact({ channel: "Other" }, service, now).error);
    assert.ok(parseSupplierContact({ channel: "SMS", nextFollowUpDate: null }, service, now).error);
    assert.ok(parseSupplierContact({ channel: "Email", note: "x".repeat(301), nextFollowUpDate: null }, service, now).error);
});

test("contact endpoints enforce permissions, ownership, current status, and expose only history fields", async (t) => {
    const bookingId = "507f1f77bcf86cd799439401";
    const stayId = "507f1f77bcf86cd799439402";
    const legId = "507f1f77bcf86cd799439403";
    const salesId = "507f1f77bcf86cd799439404";
    const viewerId = "507f1f77bcf86cd799439405";
    const booking = new Booking({
        _id: bookingId, bookingCode: "DCJ-TEST-401", bookingStatus: "Confirmed",
        customer: { fullName: "Guest", email: "private@example.test", whatsappNumber: "+94771234567", country: "UK" },
        travelStartDate: "2027-04-01", travelEndDate: "2027-04-08", numberOfTravelers: 2, totalPrice: 1000,
        hotelStays: [{ _id: stayId, hotelName: "Hotel A", checkInDate: "2027-04-01", checkOutDate: "2027-04-03", notes: "Other private hotel note" }],
        transportAssignments: [{ _id: legId, route: "Airport", startDate: "2027-04-01", endDate: "2027-04-01" }],
    });
    let writes = 0;
    let logs = 0;
    let stale = false;
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({
        _id: id, name: "Sales Agent", role: String(id) === viewerId ? "Viewer" : "Sales", status: "Active", tokenVersion: 0,
    }) }));
    t.mock.method(Booking, "findById", (id) => ({ select: async () => String(id) === bookingId ? booking : null }));
    t.mock.method(Booking, "findOneAndUpdate", async (query, update, options) => {
        writes += 1;
        assert.equal(options.runValidators, true);
        assert.equal(query.bookingStatus.$in.includes("Confirmed"), true);
        const field = query.hotelStays ? "hotelStays" : "transportAssignments";
        const match = query[field].$elemMatch;
        const item = booking[field].id(match._id);
        assert.equal(match.status, "Requested");
        if (stale || item.status !== "Requested" || item[ field === "hotelStays" ? "checkInDate" : "startDate" ].getTime() !== new Date(match[field === "hotelStays" ? "checkInDate" : "startDate"]).getTime()) return null;
        item.contacts.push(...update.$push[`${field}.$.contacts`].$each);
        item.followUpDate = update.$set[`${field}.$.followUpDate`];
        return booking;
    });
    t.mock.method(ActivityLog, "create", async (data) => {
        logs += 1;
        assert.equal(JSON.stringify(data).includes("Private contact note"), false);
        return data;
    });
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}/api/bookings/${bookingId}/supplier-contacts`;
    const hotelUrl = `${base}/hotel/${stayId}`;
    const transportUrl = `${base}/transport/${legId}`;
    const request = (url, method = "GET", id = salesId, body) => fetch(url, {
        method, headers: id ? { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}`, "Content-Type": "application/json" } : {},
        body: body === undefined ? undefined : JSON.stringify(body),
    });

    assert.equal((await request(hotelUrl, "GET", null)).status, 401);
    assert.equal((await request(hotelUrl, "POST", viewerId, { channel: "Email", nextFollowUpDate: null })).status, 403);
    assert.equal((await request(hotelUrl.replace("/hotel/", "/invalid/"))).status, 400);
    assert.equal((await request(hotelUrl.replace(stayId, "507f1f77bcf86cd799439499"))).status, 404);
    assert.equal((await request(hotelUrl.replace(bookingId, "507f1f77bcf86cd799439499"))).status, 404);
    const viewerHistory = await request(hotelUrl, "GET", viewerId);
    assert.equal(viewerHistory.status, 200);
    assert.equal(viewerHistory.headers.get("cache-control"), "no-store");
    assert.deepEqual((await viewerHistory.json()).contacts, []);

    assert.equal((await request(hotelUrl, "POST", salesId, { channel: "Phone", nextFollowUpDate: "2027-04-02" })).status, 400);
    assert.equal(writes, 0);
    const logged = await request(hotelUrl, "POST", salesId, { channel: "Phone", note: "Private contact note", nextFollowUpDate: "2027-04-01" });
    assert.equal(logged.status, 200, await logged.clone().text());
    const history = await logged.json();
    assert.equal(history.contacts[0].note, "Private contact note");
    assert.equal(history.contacts[0].contactedBy, "Sales Agent");
    assert.equal(history.title, "Hotel A");
    assert.equal(JSON.stringify(history).includes("private@example.test"), false);
    assert.equal(JSON.stringify(history).includes("Other private hotel note"), false);
    assert.equal(booking.transportAssignments.id(legId).contacts.length, 0);

    stale = true;
    assert.equal((await request(transportUrl, "POST", salesId, { channel: "WhatsApp", nextFollowUpDate: null })).status, 409);
    stale = false;
    assert.equal((await request(transportUrl, "POST", salesId, { channel: "WhatsApp", nextFollowUpDate: null })).status, 200);
    assert.equal((await (await request(transportUrl)).json()).contacts[0].channel, "WhatsApp");
    booking.hotelStays.id(stayId).status = "Confirmed";
    assert.equal((await request(hotelUrl, "POST", salesId, { channel: "Phone", nextFollowUpDate: null })).status, 409);
    assert.equal((await (await request(hotelUrl)).json()).contacts.length, 1);
    booking.bookingStatus = "Completed";
    assert.equal((await request(transportUrl, "POST", salesId, { channel: "Phone", nextFollowUpDate: null })).status, 409);
    assert.equal(logs, 2);
    assert.equal(writes, 3);
});
