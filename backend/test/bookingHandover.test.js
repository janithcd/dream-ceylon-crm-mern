const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
const app = require("../app");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const ActivityLog = require("../models/ActivityLog");

const bookingId = "507f1f77bcf86cd799439311";
const authorId = "507f1f77bcf86cd799439312";
const note = (index) => ({ _id: new mongoose.Types.ObjectId(), text: `Private handover ${index}`,
    createdAt: new Date(`2027-03-${String(index + 1).padStart(2, "0")}`),
    createdBy: new mongoose.Types.ObjectId(authorId), createdByName: "Casey" });

test("handover schema validates private append-only notes and a bounded booking", async () => {
    const booking = new Booking({
        bookingCode: "DCJ-NOTES", bookingStatus: "Confirmed", customer: {
            fullName: "Guest", email: "private@example.invalid", whatsappNumber: "+94770000000", country: "UK",
        }, travelStartDate: new Date("2027-03-01"), travelEndDate: new Date("2027-03-08"),
        numberOfTravelers: 1, totalPrice: 100,
        handoverNotes: [note(0)],
    });
    await booking.validate();
    booking.handoverNotes[0].text = "x".repeat(1001);
    await assert.rejects(booking.validate(), /longer than the maximum allowed length/);
    booking.handoverNotes[0].text = "Valid note";
    booking.handoverNotes = Array.from({ length: 201 }, (_, index) => note(index % 20));
    await assert.rejects(booking.validate(), /200 handover notes/);
    assert.equal(Booking.schema.path("handoverNotes").options.select, false);
});

test("handover API paginates privately and only editors can append notes", async (t) => {
    const salesId = "507f1f77bcf86cd799439313";
    const viewerId = "507f1f77bcf86cd799439314";
    const updateOnlyId = "507f1f77bcf86cd799439315";
    const booking = { _id: new mongoose.Types.ObjectId(bookingId), bookingCode: "DCJ-NOTES",
        customer: { fullName: "Guest", email: "PRIVATE@example.invalid" },
        handoverNotes: Array.from({ length: 22 }, (_, index) => note(index)),
        adminNotes: "PRIVATE ADMIN NOTE", totalPrice: 999999 };
    let reads = 0;
    let writes = 0;
    let cap = false;
    const logs = [];
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({
        _id: id, name: "Casey", role: String(id) === viewerId ? "Viewer" : String(id) === updateOnlyId ? "Unknown Role" : "Sales",
        customPermissions: String(id) === updateOnlyId ? ["booking.update"] : [], status: "Active", tokenVersion: 0,
    }) }));
    t.mock.method(Booking, "findById", (id) => ({ select: async (fields) => {
        reads += 1;
        assert.match(fields, /\+handoverNotes/);
        return String(id) === bookingId ? booking : null;
    } }));
    t.mock.method(Booking, "findOneAndUpdate", async (query, update, options) => {
        writes += 1;
        assert.deepEqual(query["handoverNotes.199"], { $exists: false });
        assert.equal(options.runValidators, true);
        if (cap) return null;
        booking.handoverNotes.push(update.$push.handoverNotes);
        return booking;
    });
    t.mock.method(Booking, "exists", async () => ({ _id: bookingId }));
    t.mock.method(ActivityLog, "create", async (entry) => { logs.push(entry); return entry; });
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}/api/bookings/${bookingId}/handover-notes`;
    const auth = (id) => ({ Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` });
    const post = (text, id = salesId) => fetch(url, { method: "POST", headers: { ...auth(id), "Content-Type": "application/json" },
        body: JSON.stringify({ text }) });
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: auth(updateOnlyId) })).status, 403);
    assert.equal((await post("A handover", viewerId)).status, 403);
    assert.equal((await fetch(url.replace(bookingId, "bad"), { headers: auth(salesId) })).status, 400);
    assert.equal((await fetch(`${url}?page=0`, { headers: auth(salesId) })).status, 400);
    assert.equal((await fetch(`${url}?page=1.5`, { headers: auth(salesId) })).status, 400);
    assert.equal((await post(" ")).status, 400);
    assert.equal((await post("x".repeat(1001))).status, 400);
    assert.equal(reads, 0);
    assert.equal(writes, 0);
    assert.equal((await fetch(url.replace(bookingId, "507f1f77bcf86cd799439399"), { headers: auth(salesId) })).status, 404);
    const firstResponse = await fetch(url, { headers: auth(viewerId) });
    assert.equal(firstResponse.status, 200);
    assert.equal(firstResponse.headers.get("cache-control"), "no-store");
    const first = await firstResponse.json();
    assert.equal(first.total, 22);
    assert.equal(first.totalPages, 2);
    assert.equal(first.notes.length, 20);
    assert.equal(first.notes[0].text, "Private handover 21");
    const second = await (await fetch(`${url}?page=2`, { headers: auth(salesId) })).json();
    assert.deepEqual(second.notes.map((entry) => entry.text), ["Private handover 1", "Private handover 0"]);
    assert.equal(JSON.stringify(first).includes("PRIVATE ADMIN NOTE"), false);
    assert.equal(JSON.stringify(first).includes("999999"), false);
    assert.equal(JSON.stringify(first).includes("PRIVATE@example.invalid"), false);
    assert.equal(writes, 0);
    const savedResponse = await post("  Call guest after flight lands.  ");
    assert.equal(savedResponse.status, 201);
    assert.equal(savedResponse.headers.get("cache-control"), "no-store");
    const saved = await savedResponse.json();
    assert.equal(saved.note.text, "Call guest after flight lands.");
    assert.equal(saved.note.createdByName, "Casey");
    assert.equal(booking.handoverNotes.length, 23);
    assert.equal(logs.length, 1);
    assert.equal(JSON.stringify(logs).includes("Call guest after flight"), false);
    cap = true;
    assert.equal((await post("Another note")).status, 409);
    assert.equal(logs.length, 1);
});
