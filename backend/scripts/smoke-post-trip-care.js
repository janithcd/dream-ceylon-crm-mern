const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const ActivityLog = require("../models/ActivityLog");

const main = async () => {
    if (process.env.CI_SMOKE_TESTS !== "true") throw new Error("This smoke test must be explicitly enabled in CI");
    await mongoose.connect(process.env.MONGO_URI);
    const admins = [];
    const bookings = [];
    try {
        const dateOnly = (instant) => {
            const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
                timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit",
            }).formatToParts(instant).map(({ type, value }) => [type, value]));
            return `${parts.year}-${parts.month}-${parts.day}`;
        };
        const dayMs = 86400000;
        const start = dateOnly(new Date(Date.now() - 5 * dayMs));
        const end = dateOnly(new Date(Date.now() - 2 * dayMs));
        for (const role of ["Sales", "Viewer"]) admins.push(await Admin.create({
            name: `CI Post Trip ${role}`, email: `ci-post-trip-${role}-${Date.now()}@example.invalid`,
            password: "disposable-ci-only-password", role,
        }));
        for (const status of ["Completed", "In Progress"]) bookings.push(await Booking.create({
            bookingCode: `CI-POST-${status === "Completed" ? "DONE" : "OPEN"}-${Date.now()}`,
            customer: { fullName: "CI Guest", email: "private-post-trip@example.invalid", whatsappNumber: "+94771234567", country: "UK" },
            travelStartDate: new Date(start), travelEndDate: new Date(end), numberOfTravelers: 2,
            totalPrice: 900, bookingStatus: status, adminNotes: "PRIVATE-POST-TRIP-NOTE",
        }));
        const request = (admin, path, method = "GET", body) => fetch(`http://127.0.0.1:5000/api/bookings${path}`, {
            method, headers: { Authorization: `Bearer ${jwt.sign({ id: admin._id, v: 0 }, process.env.JWT_SECRET)}`,
                "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const [sales, viewer] = admins;
        const [completed, open] = bookings;
        const queue = async (filter) => {
            const response = await request(sales, `/post-trip-care?filter=${filter}`);
            assert.equal(response.status, 200, `Post-trip ${filter}: ${await response.clone().text()}`);
            return response.json();
        };
        const recoveryAlerts = async () => {
            const response = await request(viewer, "/post-trip-care/alerts");
            assert.equal(response.status, 200, await response.clone().text());
            assert.equal(response.headers.get("cache-control"), "no-store");
            const result = await response.json();
            for (const secret of ["Pickup was late", "private-post-trip@example.invalid", "PRIVATE-POST-TRIP-NOTE"]) {
                assert.ok(!JSON.stringify(result).includes(secret), `Recovery alert exposed ${secret}`);
            }
            return result;
        };
        const due = await queue("due");
        assert.ok(due.items.some((item) => item.bookingCode === completed.bookingCode));
        assert.ok(!JSON.stringify(due).includes("private-post-trip@example.invalid"));
        assert.ok(!JSON.stringify(due).includes("PRIVATE-POST-TRIP-NOTE"));
        assert.ok((await queue("closeout")).items.some((item) => item.bookingCode === open.bookingCode));
        const contactAlerts = await recoveryAlerts();
        assert.ok(contactAlerts.contact.count > 0);
        assert.ok(contactAlerts.contact.items.some((item) => item.bookingCode === completed.bookingCode));
        const path = `/${completed._id}/post-trip-care`;
        const draftPath = `/${completed._id}/post-trip-message`;
        assert.equal((await request(viewer, draftPath)).status, 403);
        assert.equal((await request(viewer, path, "PATCH", { action: "contacted", note: "", channel: "Phone", expectedRevision: 0 })).status, 403);
        const draft = await request(sales, draftPath);
        assert.equal(draft.status, 200);
        assert.equal(draft.headers.get("cache-control"), "no-store");
        assert.match((await draft.json()).message, /thank you for traveling/i);
        assert.equal((await Booking.findById(completed._id)).postTripCare, null, "Drafting must not record contact");
        assert.ok((await recoveryAlerts()).contact.items.some((item) => item.bookingCode === completed.bookingCode));
        const contact = { action: "contacted", note: "Sent after the tour", channel: "WhatsApp", expectedRevision: 0,
            nextFeedbackFollowUpDate: dateOnly(new Date()) };
        assert.equal((await request(sales, path, "PATCH", contact)).status, 200);
        assert.ok(!(await recoveryAlerts()).contact.items.some((item) => item.bookingCode === completed.bookingCode));
        assert.equal((await request(sales, path, "PATCH", contact)).status, 409);
        assert.ok((await recoveryAlerts()).feedback.items.some((item) => item.bookingCode === completed.bookingCode));
        assert.ok((await queue("feedback-due")).items.some((item) => item.bookingCode === completed.bookingCode));
        assert.equal((await recoveryAlerts()).feedback.overdue, 0);
        assert.equal((await request(viewer, path, "PATCH", { action: "schedule-feedback", note: "", expectedRevision: 1, nextFeedbackFollowUpDate: null })).status, 403);
        assert.equal((await request(sales, path, "PATCH", { action: "schedule-feedback", note: "", expectedRevision: 0, nextFeedbackFollowUpDate: null })).status, 409);
        assert.equal((await request(sales, path, "PATCH", { action: "schedule-feedback", note: "", expectedRevision: 1,
            nextFeedbackFollowUpDate: dateOnly(new Date(Date.now() + 100 * dayMs)) })).status, 400);
        await Booking.updateOne({ _id: completed._id }, { $set: { "postTripCare.nextFeedbackFollowUpDate": new Date(dateOnly(new Date(Date.now() - dayMs))) } });
        assert.ok((await recoveryAlerts()).feedback.overdue > 0);
        const schedule = await request(sales, path, "PATCH", { action: "schedule-feedback", note: "", expectedRevision: 1,
            nextFeedbackFollowUpDate: dateOnly(new Date(Date.now() + dayMs)) });
        assert.equal(schedule.status, 200, await schedule.clone().text());
        assert.equal((await schedule.json()).care.contactCount, 1, "Scheduling must not record another contact");
        assert.ok(!(await recoveryAlerts()).feedback.items.some((item) => item.bookingCode === completed.bookingCode));
        assert.ok((await queue("waiting")).items.some((item) => item.bookingCode === completed.bookingCode));
        const feedback = await request(sales, path, "PATCH", { action: "feedback", note: "Loved the trip", rating: 5, expectedRevision: 2 });
        assert.equal(feedback.status, 200, await feedback.clone().text());
        assert.equal((await feedback.json()).care.revision, 3);
        assert.equal((await (await request(sales, path)).json()).nextFeedbackFollowUpDate, null);
        assert.ok((await queue("done")).items.some((item) => item.bookingCode === completed.bookingCode));
        assert.equal((await request(sales, draftPath)).status, 409);
        assert.equal((await (await request(sales, path)).json()).feedbackNote, "Loved the trip");
        assert.equal((await request(sales, `/${open._id}/post-trip-care`, "PATCH", contact)).status, 409);
        const low = await request(sales, path, "PATCH", { action: "feedback", note: "Pickup was late", rating: 2, expectedRevision: 3 });
        assert.equal(low.status, 200, await low.clone().text());
        const needsRecovery = await queue("recovery");
        assert.ok(needsRecovery.items.some((item) => item.bookingCode === completed.bookingCode));
        assert.ok(!JSON.stringify(needsRecovery).includes("Pickup was late"), "Queue must not expose feedback notes");
        assert.equal((await recoveryAlerts()).summary.unscheduled, 1);
        assert.equal((await recoveryAlerts()).items[0].bookingCode, completed.bookingCode);
        const plan = await request(sales, path, "PATCH", { action: "recovery-plan", note: "Call the guest tomorrow",
            nextFollowUpDate: dateOnly(new Date(Date.now() + dayMs)), expectedRevision: 4 });
        assert.equal(plan.status, 200, await plan.clone().text());
        assert.equal((await recoveryAlerts()).summary.count, 0);
        await Booking.updateOne({ _id: completed._id }, { $set: { "postTripCare.recovery.nextFollowUpDate": new Date(dateOnly(new Date())) } });
        assert.equal((await recoveryAlerts()).summary.dueToday, 1);
        await Booking.updateOne({ _id: completed._id }, { $set: { "postTripCare.recovery.nextFollowUpDate": new Date(dateOnly(new Date(Date.now() - dayMs))) } });
        assert.equal((await recoveryAlerts()).summary.overdue, 1);
        assert.equal((await request(viewer, path, "PATCH", { action: "recovery-resolve", note: "Guest accepted our remedy", nextFollowUpDate: null, expectedRevision: 5 })).status, 403);
        assert.equal((await request(sales, path, "PATCH", { action: "recovery-resolve", note: "Guest accepted our remedy", nextFollowUpDate: null, expectedRevision: 4 })).status, 409);
        const resolved = await request(sales, path, "PATCH", { action: "recovery-resolve", note: "Guest accepted our remedy",
            nextFollowUpDate: null, expectedRevision: 5 });
        assert.equal(resolved.status, 200, await resolved.clone().text());
        assert.ok(!(await queue("recovery")).items.some((item) => item.bookingCode === completed.bookingCode));
        assert.ok((await queue("recovery-closed")).items.some((item) => item.bookingCode === completed.bookingCode));
        assert.equal((await recoveryAlerts()).summary.count, 0);
        assert.equal((await (await request(viewer, path)).json()).recovery.events[0].action, "resolve");
        const audit = await ActivityLog.find({ relatedRecordId: completed._id, description: /Guest (contact|feedback) recorded/ });
        assert.equal(audit.length, 3);
        assert.ok(!JSON.stringify(audit).includes("Loved the trip"));
        assert.ok(!JSON.stringify(await ActivityLog.find({ relatedRecordId: completed._id })).includes("Guest accepted our remedy"));
        console.log("Post-trip contact, feedback reminders, recovery, permissions and stale-write checks passed.");
    } finally {
        if (bookings.length) {
            await ActivityLog.deleteMany({ relatedRecordId: { $in: bookings.map((item) => item._id) } });
            await Booking.deleteMany({ _id: { $in: bookings.map((item) => item._id) } });
        }
        if (admins.length) await Admin.deleteMany({ _id: { $in: admins.map((item) => item._id) } });
        await mongoose.disconnect();
    }
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
