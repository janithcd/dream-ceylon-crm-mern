const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";

const app = require("../app");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const ActivityLog = require("../models/ActivityLog");

test("booking history is scoped, permission-aware, and paginated", async (t) => {
    const bookingId = "507f1f77bcf86cd799439011";
    const otherBookingId = "507f1f77bcf86cd799439012";
    const salesId = "507f1f77bcf86cd799439013";
    const financeId = "507f1f77bcf86cd799439014";
    const noAccessId = "507f1f77bcf86cd799439015";

    const entries = Array.from({ length: 25 }, (_, index) => ({
        _id: new mongoose.Types.ObjectId(),
        relatedModel: "Booking",
        relatedRecordId: new mongoose.Types.ObjectId(bookingId),
        module: "Booking",
        status: "Success",
        action: "UPDATE",
        description: `Task changed ${index}`,
        adminName: "Sales Agent",
        createdAt: new Date(2027, 0, 26 - index),
        metadata: { secret: "never disclose metadata" },
    }));
    entries.push({
        ...entries[0], _id: new mongoose.Types.ObjectId(), module: "PDF",
        description: "Invoice generated", createdAt: new Date(2027, 0, 27),
    }, {
        ...entries[0], _id: new mongoose.Types.ObjectId(), relatedModel: "BookingPayment",
        relatedRecordId: new mongoose.Types.ObjectId(), module: "Payment",
        metadata: { bookingId: new mongoose.Types.ObjectId(bookingId), amount: 900 },
        description: "Payment received", adminName: "Finance Agent", createdAt: new Date(2027, 0, 28),
    }, {
        ...entries[0], _id: new mongoose.Types.ObjectId(), relatedRecordId: new mongoose.Types.ObjectId(otherBookingId),
        description: "Other booking", createdAt: new Date(2027, 0, 29),
    }, {
        ...entries[0], _id: new mongoose.Types.ObjectId(), status: "Failed",
        description: "Failed private operation", createdAt: new Date(2027, 0, 30),
    }, {
        ...entries[0], _id: new mongoose.Types.ObjectId(), module: "Other",
        description: "Supplier cost entry changed", createdAt: new Date(2027, 0, 31),
    });

    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({
        _id: id,
        role: String(id) === financeId ? "Finance" : String(id) === salesId ? "Sales" : "Unknown",
        status: "Active",
    }) }));
    t.mock.method(Booking, "exists", async ({ _id }) => String(_id) === bookingId ? { _id } : null);

    const matches = (query) => entries.filter((entry) => entry.status === query.status && query.$or.some((term) =>
        term.relatedModel === entry.relatedModel && (
            term.relatedModel === "Booking"
                ? String(term.relatedRecordId) === String(entry.relatedRecordId) &&
                    (term.module?.$ne === undefined || entry.module !== term.module.$ne)
                : term.module === entry.module && String(term["metadata.bookingId"]) === String(entry.metadata.bookingId)
        )
    ));
    t.mock.method(ActivityLog, "countDocuments", async (query) => matches(query).length);
    t.mock.method(ActivityLog, "find", (query) => {
        let start = 0;
        let size = 20;
        return {
            select(fields) { assert.doesNotMatch(fields, /metadata|adminEmail/); return this; },
            sort() { return this; },
            skip(value) { start = value; return this; },
            limit(value) { size = value; return this; },
            async lean() { return matches(query).sort((a, b) => b.createdAt - a.createdAt).slice(start, start + size); },
        };
    });

    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}/api/bookings`;
    const request = (path, id) => fetch(`${base}/${path}`, {
        headers: id ? { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` } : {},
    });

    assert.equal((await request(`${bookingId}/activity`)).status, 401);
    assert.equal((await request(`${bookingId}/activity`, noAccessId)).status, 403);
    assert.equal((await request("bad/activity", salesId)).status, 400);
    assert.equal((await request(`${otherBookingId}/activity`, salesId)).status, 404);

    const salesResponse = await request(`${bookingId}/activity`, salesId);
    assert.equal(salesResponse.status, 200);
    const sales = await salesResponse.json();
    assert.equal(sales.totalEvents, 26);
    assert.equal(sales.totalPages, 2);
    assert.equal(sales.events.length, 20);
    assert.equal(sales.events[0].description, "Invoice generated");
    assert.equal(sales.events.some((event) => event.module === "Payment"), false);
    assert.equal(sales.events.some((event) => event.module === "Other"), false);
    assert.equal("metadata" in sales.events[0], false);
    assert.equal("adminEmail" in sales.events[0], false);

    const older = await (await request(`${bookingId}/activity?page=2`, salesId)).json();
    assert.equal(older.events.length, 6);
    assert.equal(older.currentPage, 2);

    const finance = await (await request(`${bookingId}/activity`, financeId)).json();
    assert.equal(finance.totalEvents, 28);
    assert.equal(finance.events[0].description, "Supplier cost entry changed");
    assert.ok(finance.events.some((event) => event.description === "Payment received"));
    assert.equal((await (await request(`${bookingId}/activity?page=bad`, salesId)).json()).currentPage, 1);
});
