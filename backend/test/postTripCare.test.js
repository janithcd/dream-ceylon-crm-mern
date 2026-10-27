const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
process.env.AUTH_RATE_LIMIT_MAX = "1000";
const app = require("../app");
const Booking = require("../models/Booking");
const Admin = require("../models/Admin");
const ActivityLog = require("../models/ActivityLog");
const CompanySetting = require("../models/CompanySetting");
const { getBusinessDayBounds } = require("../utils/businessDate");
const { getPostTripQuery, parseCareAction, summarizeCare } = require("../utils/postTripCare");
const { buildPostTripMessage } = require("../utils/postTripMessage");

const makeBooking = () => {
    const today = getBusinessDayBounds().start;
    return new Booking({
        _id: "507f1f77bcf86cd799439251", bookingCode: "DCJ-POST-TRIP", bookingStatus: "Completed",
        customer: { fullName: "Private Guest", email: "PRIVATE@example.invalid", whatsappNumber: "+447700900123", country: "UK" },
        travelStartDate: new Date(today.getTime() - 4 * 86400000), travelEndDate: new Date(today.getTime() - 2 * 86400000),
        numberOfTravelers: 2, totalPrice: 1800, adminNotes: "PRIVATE-INTERNAL-NOTE",
    });
};

test("post-trip queue starts after the Colombo end day and distinguishes closeout, contact and outcome", () => {
    const now = new Date("2026-10-26T19:00:00Z"); // October 27 in Colombo
    const due = getPostTripQuery("due", now);
    assert.equal(due.travelEndDate.$lt.toISOString(), "2026-10-26T18:30:00.000Z");
    assert.equal(due.travelEndDate.$gte.toISOString(), "2026-07-28T18:30:00.000Z");
    assert.equal(due.bookingStatus, "Completed");
    assert.deepEqual(getPostTripQuery("closeout", now).bookingStatus.$in, ["Confirmed", "In Progress"]);
    assert.equal(getPostTripQuery("waiting", now)["postTripCare.status"], "Contacted");
    assert.deepEqual(getPostTripQuery("done", now)["postTripCare.status"].$in, ["Feedback received", "Declined"]);
});

test("care actions preserve contact history, validate actual feedback and stop after a decline", () => {
    const now = new Date("2026-10-27T05:00:00Z");
    assert.ok(parseCareAction({ action: "contacted", channel: "WhatsApp", note: "", expectedRevision: "0" }, null, "Sales").error);
    assert.ok(parseCareAction({ action: "contacted", channel: "SMS", note: "", expectedRevision: 0 }, null, "Sales").error);
    const contacted = parseCareAction({ action: "contacted", channel: "Email", note: " Asked for photos ", expectedRevision: 0 }, null, "Sales", now).value;
    assert.equal(contacted.status, "Contacted");
    assert.equal(contacted.contactCount, 1);
    assert.equal(contacted.contactNote, "Asked for photos");
    assert.ok(parseCareAction({ action: "feedback", note: "", rating: null, expectedRevision: 1 }, contacted, "Sales").error);
    assert.ok(parseCareAction({ action: "feedback", note: "Great", rating: 6, expectedRevision: 1 }, contacted, "Sales").error);
    const received = parseCareAction({ action: "feedback", note: " Loved the guide ", rating: 5, expectedRevision: 1 }, contacted, "Sales", now).value;
    assert.equal(received.contactCount, 1);
    assert.equal(received.feedbackNote, "Loved the guide");
    assert.equal(received.feedbackRating, 5);
    assert.ok(parseCareAction({ action: "contacted", channel: "Phone", note: "", expectedRevision: 2 }, received, "Sales").error);
    const declined = parseCareAction({ action: "declined", note: "No more messages", expectedRevision: 0 }, null, "Sales", now).value;
    assert.ok(parseCareAction({ action: "declined", note: "", expectedRevision: 1 }, declined, "Sales").error);
    assert.ok(parseCareAction({ action: "feedback", note: "Changed mind", expectedRevision: 1 }, declined, "Sales").error);
    assert.ok(parseCareAction({ action: "contacted", channel: "Phone", note: "", expectedRevision: 1 }, declined, "Sales").error);
});

test("queue summary and message omit financial and internal booking information", () => {
    const booking = makeBooking();
    const before = booking.toObject();
    const summary = summarizeCare(booking);
    const draft = buildPostTripMessage(booking, { companyName: "Dream Ceylon Journeys", bankDetails: "PRIVATE-BANK" });
    assert.equal(summary.status, "Not contacted");
    assert.match(draft.message, /thank you for traveling/);
    assert.equal(draft.number, "+447700900123");
    for (const secret of ["1800", "PRIVATE-INTERNAL", "PRIVATE@example.invalid", "PRIVATE-BANK"]) {
        assert.ok(!JSON.stringify(summary).includes(secret));
        assert.ok(!draft.message.includes(secret));
    }
    assert.deepEqual(booking.toObject(), before);
});

test("post-trip API separates message drafting from versioned writes and enforces permissions", async (t) => {
    const booking = makeBooking();
    const sales = "507f1f77bcf86cd799439252";
    const viewer = "507f1f77bcf86cd799439253";
    const logs = [];
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({
        _id: id, name: "Agent", role: String(id) === viewer ? "Viewer" : "Sales", status: "Active", tokenVersion: 0,
    }) }));
    t.mock.method(Booking, "findById", (id) => ({ select: async () => String(id) === String(booking._id) ? booking : null }));
    t.mock.method(Booking, "findOneAndUpdate", async (query, update) => {
        const expected = typeof query.postTripCareRevision === "object" ? 0 : query.postTripCareRevision;
        if (expected !== booking.postTripCareRevision || booking.bookingStatus !== query.bookingStatus) return null;
        booking.postTripCare = update.$set.postTripCare;
        booking.postTripCareRevision += 1;
        return booking;
    });
    t.mock.method(ActivityLog, "create", async (entry) => { logs.push(entry); return entry; });
    t.mock.method(CompanySetting, "findOne", async () => null);
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}/api/bookings/${booking._id}`;
    const request = (path, admin, method = "GET", body) => fetch(path, { method, headers: admin ? {
        Authorization: `Bearer ${jwt.sign({ id: admin, v: 0 }, process.env.JWT_SECRET)}`,
        "Content-Type": "application/json",
    } : {}, body: body === undefined ? undefined : JSON.stringify(body) });
    assert.equal((await request(`${base}/post-trip-care`, null)).status, 401);
    assert.equal((await request(`${base}/post-trip-message`, viewer)).status, 403);
    assert.equal((await request(`${base}/post-trip-care`, viewer, "PATCH", { action: "contacted", expectedRevision: 0, channel: "Phone", note: "" })).status, 403);
    assert.equal((await request(`${base}/post-trip-care`, sales, "PATCH", { action: "contacted", expectedRevision: "0", channel: "Phone", note: "" })).status, 400);
    assert.equal((await request(`${base}/post-trip-care`, sales, "PATCH", { action: "contacted", expectedRevision: 1, channel: "Phone", note: "" })).status, 409);
    const draft = await request(`${base}/post-trip-message`, sales);
    assert.equal(draft.status, 200);
    assert.equal(draft.headers.get("cache-control"), "no-store");
    assert.equal((await draft.json()).number, "+447700900123");
    assert.equal(booking.postTripCare, null);
    const contact = await request(`${base}/post-trip-care`, sales, "PATCH", { action: "contacted", expectedRevision: 0, channel: "Phone", note: "" });
    assert.equal(contact.status, 200, await contact.clone().text());
    assert.equal((await contact.json()).care.revision, 1);
    assert.equal(booking.postTripCare.status, "Contacted");
    assert.equal((await request(`${base}/post-trip-care`, sales, "PATCH", { action: "contacted", expectedRevision: 0, channel: "Phone", note: "" })).status, 409);
    const feedback = await request(`${base}/post-trip-care`, sales, "PATCH", { action: "feedback", expectedRevision: 1, rating: 4, note: "Nice trip" });
    assert.equal(feedback.status, 200, await feedback.clone().text());
    assert.equal((await request(`${base}/post-trip-message`, sales)).status, 409);
    assert.equal(logs.length, 2);
    assert.ok(!JSON.stringify(logs).includes("Nice trip"));
});
