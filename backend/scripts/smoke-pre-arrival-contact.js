const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const ActivityLog = require("../models/ActivityLog");

const main = async () => {
    if (process.env.CI_SMOKE_TESTS !== "true") throw new Error("This smoke test must be explicitly enabled in CI");
    await mongoose.connect(process.env.MONGO_URI);
    let staff;
    let viewer;
    let booking;
    try {
        const dateOnly = (instant) => {
            const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
                timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit",
            }).formatToParts(instant).map(({ type, value }) => [type, value]));
            return `${parts.year}-${parts.month}-${parts.day}`;
        };
        staff = await Admin.create({ name: "CI Arrival Staff", email: `ci-arrival-${Date.now()}@example.invalid`,
            password: "disposable-ci-only-password", role: "Sales" });
        viewer = await Admin.create({ name: "CI Arrival Viewer", email: `ci-arrival-viewer-${Date.now()}@example.invalid`,
            password: "disposable-ci-only-password", role: "Viewer" });
        booking = await Booking.create({ bookingCode: `CI-ARRIVAL-${Date.now()}`, bookingStatus: "Confirmed",
            customer: { fullName: "CI Arrival Guest", email: "private-arrival@example.invalid",
                whatsappNumber: "+94771234567", country: "UK" },
            travelStartDate: new Date(dateOnly(new Date(Date.now() + 2 * 86400000))),
            travelEndDate: new Date(dateOnly(new Date(Date.now() + 8 * 86400000))),
            numberOfTravelers: 1, totalPrice: 1000, adminNotes: "PRIVATE ARRIVAL NOTE",
        });
        // Cover older bookings that do not yet have a contact revision field.
        await Booking.collection.updateOne({ _id: booking._id }, { $unset: { preArrivalRevision: "", preArrivalContact: "" } });
        const base = "http://127.0.0.1:5000/api/bookings";
        const request = (admin, path, method = "GET", body) => fetch(`${base}${path}`, {
            method, headers: { Authorization: `Bearer ${jwt.sign({ id: admin._id, v: 0 }, process.env.JWT_SECRET)}`,
                "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
        });
        const queue = async (message) => {
            const response = await request(staff, `/departure-readiness?message=${message}`);
            assert.equal(response.status, 200, await response.clone().text());
            return response.json();
        };
        const draftPath = `/${booking._id}/pre-arrival-message`;
        const contactPath = `${draftPath}/contact`;
        const alertsPath = "/departure-readiness/alerts";
        assert.equal((await request(staff, "/departure-readiness?message=invalid")).status, 400);
        assert.ok((await queue("unsent")).items.some((item) => item.bookingCode === booking.bookingCode));
        assert.ok((await queue("due")).items.some((item) => item.bookingCode === booking.bookingCode));
        assert.equal((await request(viewer, alertsPath)).status, 403);
        const alertsBefore = await request(staff, alertsPath);
        assert.equal(alertsBefore.status, 200, await alertsBefore.clone().text());
        assert.equal(alertsBefore.headers.get("cache-control"), "no-store");
        const reminders = await alertsBefore.json();
        assert.ok(reminders.items.some((item) => item.bookingCode === booking.bookingCode));
        assert.equal(JSON.stringify(reminders).includes("private-arrival@example.invalid"), false);
        assert.equal((await request(viewer, draftPath)).status, 403);
        assert.equal((await request(viewer, contactPath, "PATCH", { action: "sent", channel: "Email", expectedRevision: 0 })).status, 403);
        const draft = await request(staff, draftPath);
        assert.equal(draft.status, 200, await draft.clone().text());
        assert.equal(draft.headers.get("cache-control"), "no-store");
        assert.equal((await draft.json()).revision, 0);
        assert.equal((await Booking.findById(booking._id)).preArrivalContact, null, "Drafting must not record a send");
        const sentBody = { action: "sent", channel: "WhatsApp", expectedRevision: 0 };
        const sent = await request(staff, contactPath, "PATCH", sentBody);
        assert.equal(sent.status, 200, await sent.clone().text());
        assert.equal((await sent.json()).revision, 1);
        const saved = await Booking.findById(booking._id);
        assert.equal(saved.preArrivalContact.channel, "WhatsApp");
        assert.equal(String(saved.preArrivalContact.sentBy), String(staff._id));
        assert.equal((await request(staff, contactPath, "PATCH", sentBody)).status, 409);
        assert.ok(!(await queue("unsent")).items.some((item) => item.bookingCode === booking.bookingCode));
        assert.ok(!(await queue("due")).items.some((item) => item.bookingCode === booking.bookingCode));
        assert.ok(!(await (await request(staff, alertsPath)).json()).items.some((item) => item.bookingCode === booking.bookingCode));
        const sentQueue = await queue("sent");
        const item = sentQueue.items.find((candidate) => candidate.bookingCode === booking.bookingCode);
        assert.equal(item.preArrivalSentByName, "CI Arrival Staff");
        assert.equal(item.preArrivalSentChannel, "WhatsApp");
        assert.equal(JSON.stringify(sentQueue).includes("PRIVATE ARRIVAL NOTE"), false);
        assert.equal(JSON.stringify(sentQueue).includes("private-arrival@example.invalid"), false);
        const corrected = await request(staff, contactPath, "PATCH", {
            action: "clear", expectedRevision: 1, reason: "The message was not actually sent",
        });
        assert.equal(corrected.status, 200, await corrected.clone().text());
        assert.equal((await corrected.json()).revision, 2);
        assert.equal((await Booking.findById(booking._id)).preArrivalContact, null);
        assert.ok((await queue("unsent")).items.some((candidate) => candidate.bookingCode === booking.bookingCode));
        assert.ok((await (await request(staff, alertsPath)).json()).items.some((item) => item.bookingCode === booking.bookingCode));
        const logs = await ActivityLog.find({ relatedRecordId: booking._id, description: /Pre-arrival/ }).sort({ createdAt: 1 });
        assert.equal(logs.length, 2);
        assert.equal(logs[0].metadata.channel, "WhatsApp");
        assert.match(logs[1].metadata.reason, /not actually sent/);
        assert.equal(JSON.stringify(logs).includes("private-arrival@example.invalid"), false);
        console.log("Pre-arrival contact persists, filters update, duplicate writes fail and corrections are audited.");
    } finally {
        if (booking) {
            await ActivityLog.deleteMany({ relatedRecordId: booking._id });
            await Booking.deleteOne({ _id: booking._id });
        }
        if (staff) await Admin.deleteOne({ _id: staff._id });
        if (viewer) await Admin.deleteOne({ _id: viewer._id });
        await mongoose.disconnect();
    }
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
