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
const { getPostTripQuery, buildRecoveryAlertsPipeline, buildContactAlertsPipeline, buildFeedbackAlertsPipeline, lastCareDay,
    parseCareAction, summarizeCare } = require("../utils/postTripCare");
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
    assert.equal(getPostTripQuery("feedback-due", now)["postTripCare.nextFeedbackFollowUpDate"].$lte.toISOString(), "2026-10-27T18:29:59.999Z");
    assert.deepEqual(getPostTripQuery("done", now)["postTripCare.status"].$in, ["Feedback received", "Declined"]);
    const recovery = getPostTripQuery("recovery", now);
    assert.equal(recovery.travelEndDate.$gte, undefined, "Open recovery must remain visible after 90 days");
    assert.deepEqual(recovery["postTripCare.feedbackRating"], { $gte: 1, $lte: 3 });
    assert.deepEqual(recovery["postTripCare.recovery.status"], { $ne: "Resolved" });
    assert.equal(getPostTripQuery("recovery-closed", now)["postTripCare.recovery.status"], "Resolved");
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

test("feedback reminders require contact, stay in the care window and clear on an outcome", () => {
    const now = new Date("2026-10-26T19:00:00Z"); // October 27 in Colombo
    const tripEnd = new Date("2026-07-29T00:00:00Z"); // Last eligible care day is October 27
    assert.equal(lastCareDay(tripEnd).toISOString(), "2026-10-26T18:30:00.000Z");
    assert.ok(parseCareAction({ action: "schedule-feedback", note: "", expectedRevision: 0, nextFeedbackFollowUpDate: "2026-10-27" }, null, "Agent", now, tripEnd).error);
    const contact = { action: "contacted", channel: "Email", note: "Reached guest", expectedRevision: 0 };
    assert.ok(parseCareAction({ ...contact, nextFeedbackFollowUpDate: "2026-10-28" }, null, "Agent", now, tripEnd).error);
    const contacted = parseCareAction({ ...contact, nextFeedbackFollowUpDate: "2026-10-27" }, null, "Agent", now, tripEnd).value;
    assert.equal(contacted.nextFeedbackFollowUpDate.toISOString(), "2026-10-27T00:00:00.000Z");
    assert.ok(parseCareAction({ action: "schedule-feedback", note: "", expectedRevision: 1 }, contacted, "Agent", now, tripEnd).error);
    assert.ok(parseCareAction({ action: "schedule-feedback", note: "", expectedRevision: 1, nextFeedbackFollowUpDate: "2026-10-26" }, contacted, "Agent", now, tripEnd).error);
    const cleared = parseCareAction({ action: "schedule-feedback", expectedRevision: 1, nextFeedbackFollowUpDate: null }, contacted, "Agent", now, tripEnd).value;
    assert.equal(cleared.nextFeedbackFollowUpDate, null);
    assert.equal(cleared.contactCount, 1, "Scheduling must not log guest contact");
    const received = parseCareAction({ action: "feedback", rating: 5, note: "Lovely guide", expectedRevision: 1 }, contacted, "Agent", now, tripEnd).value;
    assert.equal(received.nextFeedbackFollowUpDate, null);
    const declined = parseCareAction({ action: "declined", note: "No further contact", expectedRevision: 1 }, contacted, "Agent", now, tripEnd).value;
    assert.equal(declined.nextFeedbackFollowUpDate, null);
});

test("low ratings create recoveries, and recovery actions validate dates and preserve a bounded history", () => {
    const now = new Date("2026-10-26T19:00:00Z"); // October 27 in Colombo
    const low = parseCareAction({ action: "feedback", note: "No pickup", rating: 2, expectedRevision: 0 }, null, "Agent", now).value;
    assert.equal(low.recovery.status, "Open");
    const plan = { action: "recovery-plan", expectedRevision: 1, note: "Call tomorrow", nextFollowUpDate: "2026-10-28" };
    assert.ok(parseCareAction({ ...plan, nextFollowUpDate: "2026-10-26" }, low, "Agent", now).error);
    assert.ok(parseCareAction({ ...plan, nextFollowUpDate: "2026-02-29" }, low, "Agent", now).error);
    assert.ok(parseCareAction({ ...plan, nextFollowUpDate: null }, low, "Agent", now).error);
    const planned = parseCareAction(plan, low, "Agent", now).value;
    assert.equal(planned.recovery.events[0].note, "Call tomorrow");
    assert.equal(planned.recovery.nextFollowUpDate.toISOString(), "2026-10-28T00:00:00.000Z");
    assert.ok(parseCareAction({ action: "feedback", expectedRevision: 2, note: "", rating: 5 }, planned, "Agent", now).error);
    assert.ok(parseCareAction({ action: "recovery-contact", expectedRevision: 2, note: "Reached guest", nextFollowUpDate: null, channel: "SMS" }, planned, "Agent", now).error);
    const contacted = parseCareAction({ action: "recovery-contact", expectedRevision: 2, note: "Reached guest by phone", nextFollowUpDate: null, channel: "Phone" }, planned, "Agent", now).value;
    assert.equal(contacted.recovery.events.length, 2);
    assert.equal(contacted.recovery.nextFollowUpDate, null);
    assert.equal(contacted.contactCount, 1);
    assert.equal(contacted.lastContactChannel, "Phone");
    assert.ok(parseCareAction({ action: "recovery-resolve", expectedRevision: 3, note: "Done", nextFollowUpDate: null }, contacted, "Agent", now).error);
    const resolved = parseCareAction({ action: "recovery-resolve", expectedRevision: 3, note: "Refund discussed and accepted", nextFollowUpDate: null }, contacted, "Agent", now).value;
    assert.equal(resolved.recovery.status, "Resolved");
    assert.ok(parseCareAction(plan, resolved, "Agent", now).error);
    const reopened = parseCareAction({ action: "recovery-reopen", expectedRevision: 4, note: "Guest called again", nextFollowUpDate: "2026-10-29" }, resolved, "Agent", now).value;
    assert.equal(reopened.recovery.status, "Open");
    assert.equal(reopened.recovery.events.length, 4);
    assert.equal(reopened.recovery.resolvedAt, null);
    const high = parseCareAction({ action: "feedback", expectedRevision: 1, note: "Corrected", rating: 4 }, low, "Agent", now).value;
    assert.equal(high.recovery, null, "A rating correction before any action removes the pending recovery");
    assert.ok(parseCareAction({ action: "recovery-plan", expectedRevision: 1, note: "Call guest", nextFollowUpDate: "2026-10-28" }, high, "Agent", now).error);
    const many = { ...planned, recovery: { ...planned.recovery, events: Array(30).fill(planned.recovery.events[0]) } };
    assert.equal(parseCareAction({ ...plan, expectedRevision: 2 }, many, "Agent", now).value.recovery.events.length, 30);
});

test("recovery alert bounds follow Sri Lanka days and omit private feedback", () => {
    const pipeline = buildRecoveryAlertsPipeline(new Date("2026-10-26T19:00:00Z")); // Oct 27 in Colombo
    assert.equal(pipeline[0].$match.bookingStatus, "Completed");
    assert.deepEqual(pipeline[0].$match["postTripCare.feedbackRating"], { $gte: 1, $lte: 3 });
    assert.deepEqual(pipeline[0].$match["postTripCare.recovery.status"], { $ne: "Resolved" });
    assert.equal(pipeline[2].$addFields.overdue.$and[1].$lt[1].toISOString(), "2026-10-26T18:30:00.000Z");
    assert.equal(pipeline[2].$addFields.dueToday.$and[1].$lte[1].toISOString(), "2026-10-27T18:29:59.999Z");
    assert.equal(pipeline[3].$facet.items[1].$limit, 5);
    assert.deepEqual(Object.keys(pipeline[3].$facet.items[2].$project).sort(),
        ["_id", "bookingId", "bookingCode", "followUpDate", "overdue", "dueToday", "unscheduled"].sort());
    for (const key of ["feedbackNote", "contactNote", "customer", "totalPrice", "events"]) {
        assert.ok(!JSON.stringify(pipeline[3]).includes(key));
    }
});

test("first-contact alerts use the 90-day Colombo window and expose only safe fields", () => {
    const pipeline = buildContactAlertsPipeline(new Date("2026-10-26T19:00:00Z"));
    assert.equal(pipeline[0].$match.bookingStatus, "Completed");
    assert.equal(pipeline[0].$match.travelEndDate.$gte.toISOString(), "2026-07-28T18:30:00.000Z");
    assert.equal(pipeline[0].$match.travelEndDate.$lt.toISOString(), "2026-10-26T18:30:00.000Z");
    assert.deepEqual(pipeline[0].$match["postTripCare.status"].$nin, ["Contacted", "Feedback received", "Declined"]);
    assert.equal(pipeline[2].$facet.items[0].$sort.travelEndDate, 1);
    assert.equal(pipeline[2].$facet.items[1].$limit, 5);
    assert.deepEqual(Object.keys(pipeline[2].$facet.items[2].$project).sort(),
        ["_id", "bookingId", "bookingCode", "travelEndDate"].sort());
    for (const key of ["customer", "contactNote", "feedbackNote", "totalPrice"]) {
        assert.ok(!JSON.stringify(pipeline[2]).includes(key));
    }
});

test("feedback alerts include only due contacted guests and safe identifiers", () => {
    const pipeline = buildFeedbackAlertsPipeline(new Date("2026-10-26T19:00:00Z"));
    assert.equal(pipeline[0].$match["postTripCare.status"], "Contacted");
    assert.equal(pipeline[0].$match.travelEndDate.$gte.toISOString(), "2026-07-28T18:30:00.000Z");
    assert.equal(pipeline[0].$match["postTripCare.nextFeedbackFollowUpDate"].$type, "date");
    assert.equal(pipeline[0].$match["postTripCare.nextFeedbackFollowUpDate"].$lte.toISOString(), "2026-10-27T18:29:59.999Z");
    assert.equal(pipeline[3].$facet.items[1].$limit, 5);
    assert.deepEqual(Object.keys(pipeline[3].$facet.items[2].$project).sort(),
        ["_id", "bookingId", "bookingCode", "followUpDate", "overdue"].sort());
    for (const secret of ["customer", "contactNote", "feedbackNote", "totalPrice", "events"]) {
        assert.ok(!JSON.stringify(pipeline.slice(1)).includes(secret));
    }
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
    t.mock.method(Booking, "aggregate", async (pipeline) => {
        if (pipeline[0].$match["postTripCare.status"] === "Feedback received") {
            return [{ summary: [{ count: 1, overdue: 0, dueToday: 0, unscheduled: 1 }],
                items: [{ bookingId: booking._id, bookingCode: booking.bookingCode,
                    followUpDate: null, overdue: false, dueToday: false, unscheduled: true }] }];
        }
        if (pipeline[0].$match["postTripCare.status"] === "Contacted") {
            return [{ summary: [], items: [] }];
        }
        assert.deepEqual(pipeline[0].$match["postTripCare.status"].$nin, ["Contacted", "Feedback received", "Declined"]);
        return [{ summary: [{ count: 1 }],
            items: [{ bookingId: booking._id, bookingCode: booking.bookingCode, travelEndDate: booking.travelEndDate }] }];
    });
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
    const alertUrl = `${base.substring(0, base.lastIndexOf("/"))}/post-trip-care/alerts`;
    assert.equal((await request(alertUrl, null)).status, 401);
    const alert = await request(alertUrl, viewer);
    assert.equal(alert.status, 200);
    assert.equal(alert.headers.get("cache-control"), "no-store");
    const alertBody = await alert.json();
    assert.equal(alertBody.summary.unscheduled, 1);
    assert.equal(alertBody.contact.count, 1);
    assert.equal(alertBody.contact.items[0].bookingCode, booking.bookingCode);
    assert.equal(alertBody.feedback.count, 0);
    assert.ok(!JSON.stringify(alertBody).includes("PRIVATE@example.invalid"));
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
    const low = await request(`${base}/post-trip-care`, sales, "PATCH", { action: "feedback", expectedRevision: 2, rating: 2, note: "Pickup was late" });
    assert.equal(low.status, 200, await low.clone().text());
    assert.equal((await low.json()).care.recoveryStatus, "Open");
    const followUp = new Date(getBusinessDayBounds().start.getTime() + 2 * 86400000).toISOString().slice(0, 10);
    assert.equal((await request(`${base}/post-trip-care`, viewer, "PATCH", {
        action: "recovery-plan", expectedRevision: 3, note: "Call tomorrow", nextFollowUpDate: followUp,
    })).status, 403);
    assert.equal((await request(`${base}/post-trip-care`, sales, "PATCH", {
        action: "recovery-plan", expectedRevision: 2, note: "Call tomorrow", nextFollowUpDate: followUp,
    })).status, 409);
    const planned = await request(`${base}/post-trip-care`, sales, "PATCH", {
        action: "recovery-plan", expectedRevision: 3, note: "Call tomorrow", nextFollowUpDate: followUp,
    });
    assert.equal(planned.status, 200, await planned.clone().text());
    assert.equal((await planned.json()).care.revision, 4);
    const detail = await request(`${base}/post-trip-care`, viewer);
    assert.equal(detail.status, 200);
    const detailBody = await detail.json();
    assert.equal(detailBody.recovery.events[0].note, "Call tomorrow");
    assert.equal(detailBody.bookingCode, booking.bookingCode);
    assert.equal(detailBody.customerName, booking.customer.fullName);
    booking.travelEndDate = new Date(getBusinessDayBounds().start.getTime() - 100 * 86400000);
    const historical = await request(`${base}/post-trip-care`, viewer);
    assert.equal(historical.status, 200);
    assert.equal((await historical.json()).careWindowOpen, false);
    assert.equal((await request(`${base}/post-trip-care`, sales, "PATCH", {
        action: "feedback", expectedRevision: 4, rating: 2, note: "Edited old feedback",
    })).status, 409);
    const resolved = await request(`${base}/post-trip-care`, sales, "PATCH", {
        action: "recovery-resolve", expectedRevision: 4, note: "Guest accepted a new itinerary", nextFollowUpDate: null,
    });
    assert.equal(resolved.status, 200, await resolved.clone().text());
    assert.equal((await resolved.json()).care.recoveryStatus, "Resolved");
    assert.equal(logs.length, 5);
    assert.ok(!JSON.stringify(logs).includes("Nice trip"));
    assert.ok(!JSON.stringify(logs).includes("Call tomorrow"));
    assert.ok(!JSON.stringify(logs).includes("new itinerary"));
});
