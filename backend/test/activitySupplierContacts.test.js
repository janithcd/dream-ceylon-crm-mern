const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
const app = require("../app");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const ActivityLog = require("../models/ActivityLog");

test("activity contacts require a current revision and cannot overwrite another editor's changes", async (t) => {
    const bookingId = "507f1f77bcf86cd799439501", itemId = "507f1f77bcf86cd799439502";
    const staffId = "507f1f77bcf86cd799439503", viewerId = "507f1f77bcf86cd799439504";
    const booking = new Booking({ _id: bookingId, bookingCode: "DCJ-CONTACT", bookingStatus: "Confirmed", __v: 2,
        customer: { fullName: "Guest", email: "private@example.invalid", whatsappNumber: "+94771234567", country: "UK" },
        travelStartDate: "2035-04-01", travelEndDate: "2035-04-05", numberOfTravelers: 2, totalPrice: 1000,
        excursions: [{ _id: itemId, title: "Safari", type: "Safari", date: "2035-04-02", participants: 2,
            supplierName: "Jeep operator", status: "Requested", internalNotes: "PRIVATE ACTIVITY NOTE" }],
    });
    let race = false, writes = 0;
    const logs = [];
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({ _id: id, name: "Sales Agent",
        role: String(id) === viewerId ? "Viewer" : "Sales", status: "Active", tokenVersion: 0 }) }));
    t.mock.method(Booking, "findById", (id) => ({ select: async () => String(id) === bookingId ? booking : null }));
    t.mock.method(Booking, "findOneAndUpdate", async (query, update, options) => {
        writes++;
        assert.equal(options.runValidators, true);
        assert.deepEqual(query.excursionsRevision, booking.excursionsRevision === 0 ? { $in: [0, null] } : booking.excursionsRevision);
        assert.deepEqual(update.$inc, { excursionsRevision: 1, __v: 1 });
        assert.equal(query.excursions.$elemMatch.status, "Requested");
        assert.equal(query.excursions.$elemMatch.date.getTime(), booking.excursions[0].date.getTime());
        assert.equal(update.$push["excursions.$.contacts"].$slice, -50);
        if (race) return null;
        booking.excursions[0].contacts.push(...update.$push["excursions.$.contacts"].$each);
        booking.excursions[0].followUpDate = update.$set["excursions.$.followUpDate"];
        booking.excursionsRevision++; booking.__v++;
        return booking;
    });
    t.mock.method(ActivityLog, "create", async (value) => { logs.push(value); return value; });
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}/api/bookings/${bookingId}/supplier-contacts/activity/${itemId}`;
    const request = (method = "GET", body, id = staffId, path = url) => fetch(path, { method,
        headers: { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body) });
    const body = { channel: "Phone", note: "PRIVATE CONTACT NOTE", nextFollowUpDate: "2035-04-01", expectedVersion: 0 };
    const initial = await request("GET", undefined, viewerId);
    assert.equal(initial.status, 200); assert.equal(initial.headers.get("cache-control"), "no-store");
    const initialData = await initial.json();
    assert.equal(initialData.version, 0); assert.deepEqual(initialData.contacts, []);
    assert.equal(JSON.stringify(initialData).includes("PRIVATE ACTIVITY NOTE"), false);
    assert.equal(JSON.stringify(initialData).includes("private@example.invalid"), false);
    assert.equal((await request("POST", body, viewerId)).status, 403);
    for (const type of ["constructor", "toString", "unknown"]) {
        assert.equal((await request("GET", undefined, staffId, url.replace("/activity/", `/${type}/`))).status, 400);
    }
    assert.equal((await request("POST", { ...body, expectedVersion: undefined })).status, 400);
    assert.equal((await request("POST", { ...body, expectedVersion: "0" })).status, 400);
    assert.equal((await request("POST", { ...body, expectedVersion: 1 })).status, 409);
    assert.equal((await request("POST", body, staffId, url.replace(itemId, staffId))).status, 404);
    assert.equal(writes, 0);
    const saved = await request("POST", body);
    assert.equal(saved.status, 200, await saved.clone().text());
    const data = await saved.json();
    assert.equal(data.version, 1); assert.equal(data.contacts[0].note, body.note);
    assert.equal(data.contacts[0].contactedBy, "Sales Agent");
    assert.equal(data.status, "Requested"); assert.equal(booking.__v, 3);
    assert.equal(logs.length, 1); assert.match(logs[0].description, /Activity supplier contact logged/);
    assert.equal(JSON.stringify(logs).includes(body.note), false);
    assert.equal((await request("POST", body)).status, 409, "Repeating the old revision must not duplicate contact");
    race = true;
    assert.equal((await request("POST", { ...body, expectedVersion: 1 })).status, 409);
    assert.equal(booking.excursions[0].contacts.length, 1); assert.equal(logs.length, 1);
    race = false;
    for (const status of ["Planned", "Confirmed", "Cancellation requested", "Cancelled", "Completed"]) {
        booking.excursions[0].status = status;
        assert.equal((await request("POST", { ...body, expectedVersion: 1 })).status, 409);
        assert.equal((await request()).status, 200, "Past contact history remains readable");
    }
    booking.excursions[0].status = "Requested";
    for (const status of ["Cancelled", "Completed"]) {
        booking.bookingStatus = status;
        assert.equal((await request("POST", { ...body, expectedVersion: 1 })).status, 409);
    }
    assert.equal(writes, 2);
});
