const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
const app = require("../app");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const BookingHandoverRead = require("../models/BookingHandoverRead");

test("a viewer acknowledges only the note version actually shown, monotonically", async (t) => {
    const viewerId = "507f1f77bcf86cd799439901";
    const noAccessId = "507f1f77bcf86cd799439902";
    const bookingId = "507f1f77bcf86cd799439903";
    const oldId = "507f1f77bcf86cd799439904";
    const newId = "507f1f77bcf86cd799439905";
    let exists = true;
    let duplicate = true;
    const writes = [];
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({
        _id: id, role: String(id) === noAccessId ? "Unknown Role" : "Viewer",
        status: "Active", tokenVersion: 0,
    }) }));
    t.mock.method(Booking, "findById", () => ({ select: async (fields) => {
        assert.equal(fields, "_id +handoverNotes");
        return exists ? { _id: new mongoose.Types.ObjectId(bookingId),
            handoverNotes: [{ _id: new mongoose.Types.ObjectId(oldId) }, { _id: new mongoose.Types.ObjectId(newId) }] } : null;
    } }));
    t.mock.method(BookingHandoverRead, "updateOne", async (query, update, options) => {
        writes.push({ query, update, options });
        if (duplicate) { duplicate = false; throw Object.assign(new Error("Duplicate read row"), { code: 11000 }); }
        return { matchedCount: 1 };
    });
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}/api/bookings/${bookingId}/handover-notes/seen`;
    const auth = (id) => ({ Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}`,
        "Content-Type": "application/json" });
    const patch = (id, latestNoteId, path = url) => fetch(path, { method: "PATCH", headers: auth(id),
        body: JSON.stringify({ latestNoteId }) });

    assert.equal((await fetch(url, { method: "PATCH" })).status, 401);
    assert.equal((await patch(noAccessId, oldId)).status, 403);
    assert.equal((await patch(viewerId, "invalid")).status, 400);
    assert.equal((await patch(viewerId, oldId, url.replace(bookingId, "bad"))).status, 400);
    assert.equal(writes.length, 0);
    exists = false;
    assert.equal((await patch(viewerId, oldId)).status, 404);
    exists = true;
    assert.equal((await patch(viewerId, "507f1f77bcf86cd799439999")).status, 409);
    assert.equal(writes.length, 0);

    const oldResponse = await patch(viewerId, oldId);
    assert.equal(oldResponse.status, 200);
    assert.equal(oldResponse.headers.get("cache-control"), "no-store");
    assert.equal((await oldResponse.json()).reviewedThrough, oldId);
    assert.equal(writes.length, 2, "A concurrent first read retries after the unique-key race");
    assert.deepEqual(writes[0].update, { $max: { seenCount: 1 } });
    assert.equal(writes[0].options.upsert, true);
    assert.equal(writes[1].options.upsert, undefined);
    assert.equal(String(writes[0].query.admin), viewerId);
    assert.equal(String(writes[0].query.booking), bookingId);
    assert.equal((await patch(viewerId, newId)).status, 200);
    assert.deepEqual(writes[2].update, { $max: { seenCount: 2 } });
    assert.ok(BookingHandoverRead.schema.indexes().some(([fields, options]) =>
        fields.booking === 1 && fields.admin === 1 && options.unique));
});
