const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
const app = require("../app");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const ActivityLog = require("../models/ActivityLog");
const CompanySetting = require("../models/CompanySetting");

test("sent records require a real staff action, reject stale writes and allow audited corrections", async (t) => {
    const booking = new Booking({
        _id: "507f1f77bcf86cd799439121", bookingCode: "DCJ-NOTE-TEST", bookingStatus: "Confirmed",
        travelStartDate: new Date("2099-04-01"), travelEndDate: new Date("2099-04-06"),
        customer: { fullName: "Guest", email: "PRIVATE@example.invalid", whatsappNumber: "+44 7700 900123", country: "UK" },
        totalPrice: 54321, adminNotes: "PRIVATE NOTE",
    });
    const salesId = "507f1f77bcf86cd799439122";
    const viewerId = "507f1f77bcf86cd799439123";
    const updateOnlyId = "507f1f77bcf86cd799439124";
    const logs = [];
    let reads = 0;
    let writes = 0;
    let failWrite = false;
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({
        _id: id, name: "Casey", role: String(id) === viewerId ? "Viewer" : String(id) === updateOnlyId ? "Unknown Role" : "Sales",
        customPermissions: String(id) === updateOnlyId ? ["booking.update"] : [], status: "Active", tokenVersion: 0,
    }) }));
    t.mock.method(Booking, "findById", (id) => ({ select: async () => {
        reads += 1;
        return String(id) === String(booking._id) ? booking : null;
    } }));
    t.mock.method(Booking, "findOneAndUpdate", async (query, update, options) => {
        writes += 1;
        assert.equal(query.bookingStatus, "Confirmed");
        assert.equal(options.runValidators, true);
        assert.equal(query.travelStartDate.$eq.getTime(), booking.travelStartDate.getTime());
        assert.ok(query.travelStartDate.$gte < booking.travelStartDate);
        assert.equal(update.$inc.preArrivalRevision, 1);
        if (failWrite) return null;
        if (query.preArrivalRevision !== (booking.preArrivalRevision || 0) &&
            !(booking.preArrivalRevision === 0 && query.preArrivalRevision.$in?.includes(0))) return null;
        if (update.$set.preArrivalContact && booking.preArrivalContact) return null;
        if (!update.$set.preArrivalContact && !booking.preArrivalContact) return null;
        booking.preArrivalContact = update.$set.preArrivalContact;
        booking.preArrivalRevision += 1;
        return booking;
    });
    t.mock.method(ActivityLog, "create", async (value) => { logs.push(value); return value; });
    t.mock.method(CompanySetting, "findOne", async () => ({ companyName: "Custom Tours" }));
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const endpoint = `http://127.0.0.1:${server.address().port}/api/bookings/${booking._id}/pre-arrival-message`;
    const auth = (id = salesId) => ({ Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` });
    const patch = (body, id = salesId, url = `${endpoint}/contact`) => fetch(url, {
        method: "PATCH", headers: { "Content-Type": "application/json", ...auth(id) }, body: JSON.stringify(body),
    });
    const send = { action: "sent", channel: "WhatsApp", expectedRevision: 0 };
    assert.equal((await fetch(`${endpoint}/contact`, { method: "PATCH" })).status, 401);
    assert.equal((await patch(send, viewerId)).status, 403);
    assert.equal((await patch(send, updateOnlyId)).status, 403);
    assert.equal((await patch(send, salesId, endpoint.replace(String(booking._id), "bad") + "/contact")).status, 400);
    assert.equal((await patch({ ...send, channel: "Phone" })).status, 400);
    assert.equal((await patch({ ...send, expectedRevision: "0" })).status, 400);
    assert.equal((await patch(send, salesId, endpoint.replace(String(booking._id), "507f1f77bcf86cd799439199") + "/contact")).status, 404);
    assert.equal(reads, 1);
    assert.equal(writes, 0);
    const before = await (await fetch(endpoint, { headers: auth() })).json();
    assert.equal(before.contact.sentAt, null);
    assert.equal(before.revision, 0);
    assert.equal(writes, 0);
    const recorded = await patch(send);
    assert.equal(recorded.status, 200);
    const sent = await recorded.json();
    assert.equal(sent.contact.channel, "WhatsApp");
    assert.equal(sent.contact.sentByName, "Casey");
    assert.equal(sent.revision, 1);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].metadata.channel, "WhatsApp");
    assert.equal(JSON.stringify(logs).includes("PRIVATE"), false);
    assert.equal((await patch(send)).status, 409);
    assert.equal((await patch({ ...send, expectedRevision: 1 })).status, 409);
    assert.equal((await patch({ action: "clear", expectedRevision: 1, reason: "too short" })).status, 400);
    const draft = await (await fetch(endpoint, { headers: auth() })).json();
    assert.equal(draft.contact.channel, "WhatsApp");
    assert.equal(draft.revision, 1);
    const cleared = await patch({ action: "clear", expectedRevision: 1, reason: "Recorded before guest message was sent" });
    assert.equal(cleared.status, 200);
    assert.deepEqual((await cleared.json()).contact, { sentAt: null, sentByName: "", channel: null });
    assert.equal(booking.preArrivalRevision, 2);
    assert.equal(logs.length, 2);
    assert.match(logs[1].metadata.reason, /Recorded before/);
    assert.equal((await patch({ action: "clear", expectedRevision: 2, reason: "Recorded before guest message was sent" })).status, 409);
    failWrite = true;
    assert.equal((await patch({ ...send, expectedRevision: 2 })).status, 409);
    assert.equal(logs.length, 2);
    failWrite = false;
    booking.bookingStatus = "Cancelled";
    assert.equal((await patch({ ...send, expectedRevision: 2 })).status, 409);
    booking.bookingStatus = "Confirmed";
    booking.travelStartDate = new Date("2020-01-01");
    assert.equal((await patch({ ...send, expectedRevision: 2 })).status, 409);
    assert.equal(writes, 3);
});
