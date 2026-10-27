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
        const due = await queue("due");
        assert.ok(due.items.some((item) => item.bookingCode === completed.bookingCode));
        assert.ok(!JSON.stringify(due).includes("private-post-trip@example.invalid"));
        assert.ok(!JSON.stringify(due).includes("PRIVATE-POST-TRIP-NOTE"));
        assert.ok((await queue("closeout")).items.some((item) => item.bookingCode === open.bookingCode));
        const path = `/${completed._id}/post-trip-care`;
        const draftPath = `/${completed._id}/post-trip-message`;
        assert.equal((await request(viewer, draftPath)).status, 403);
        assert.equal((await request(viewer, path, "PATCH", { action: "contacted", note: "", channel: "Phone", expectedRevision: 0 })).status, 403);
        const draft = await request(sales, draftPath);
        assert.equal(draft.status, 200);
        assert.equal(draft.headers.get("cache-control"), "no-store");
        assert.match((await draft.json()).message, /thank you for traveling/i);
        assert.equal((await Booking.findById(completed._id)).postTripCare, null, "Drafting must not record contact");
        const contact = { action: "contacted", note: "Sent after the tour", channel: "WhatsApp", expectedRevision: 0 };
        assert.equal((await request(sales, path, "PATCH", contact)).status, 200);
        assert.equal((await request(sales, path, "PATCH", contact)).status, 409);
        assert.ok((await queue("waiting")).items.some((item) => item.bookingCode === completed.bookingCode));
        const feedback = await request(sales, path, "PATCH", { action: "feedback", note: "Loved the trip", rating: 5, expectedRevision: 1 });
        assert.equal(feedback.status, 200, await feedback.clone().text());
        assert.equal((await feedback.json()).care.revision, 2);
        assert.ok((await queue("done")).items.some((item) => item.bookingCode === completed.bookingCode));
        assert.equal((await request(sales, draftPath)).status, 409);
        assert.equal((await (await request(sales, path)).json()).feedbackNote, "Loved the trip");
        assert.equal((await request(sales, `/${open._id}/post-trip-care`, "PATCH", contact)).status, 409);
        const audit = await ActivityLog.find({ relatedRecordId: completed._id, description: /Guest (contact|feedback) recorded/ });
        assert.equal(audit.length, 2);
        assert.ok(!JSON.stringify(audit).includes("Loved the trip"));
        console.log("Post-trip queue, message drafting, explicit contact, feedback and stale-write checks passed.");
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
