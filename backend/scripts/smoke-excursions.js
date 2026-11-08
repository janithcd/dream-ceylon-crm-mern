const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const ActivityLog = require("../models/ActivityLog");
const { today } = require("../utils/excursions");

const main = async () => {
    if (process.env.CI_SMOKE_TESTS !== "true") throw new Error("This smoke test must be explicitly enabled in CI");
    await mongoose.connect(process.env.MONGO_URI);
    const admins = [], bookings = [];
    try {
        for (const role of ["Super Admin", "Viewer"]) admins.push(await Admin.create({ name: `CI Activities ${role}`,
            email: `ci-activities-${role.replace(/ /g, "-")}-${Date.now()}@example.invalid`, password: "disposable-ci-only-password", role }));
        const day = today(), end = new Date(`${day}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 4);
        const endDay = end.toISOString().slice(0, 10);
        for (let i = 0; i < 2; i++) bookings.push(await Booking.create({ bookingCode: `CI-ACT-${Date.now()}-${i}`,
            customer: { fullName: "Activity Guest", email: "activity-private@example.invalid", whatsappNumber: "+94771234567", country: "UK" },
            travelStartDate: new Date(day), travelEndDate: end, numberOfTravelers: 2, totalPrice: 900, bookingStatus: "Confirmed" }));
        const booking = bookings[0];
        // Verify old bookings with no revision field can acquire their first activity.
        await Booking.collection.updateOne({ _id: booking._id }, { $unset: { excursionsRevision: "" } });
        const root = "http://127.0.0.1:5000/api/bookings", base = `${root}/${booking._id}/excursions`;
        const request = (path, method = "GET", body, admin = admins[0]) => fetch(path, { method,
            headers: { Authorization: `Bearer ${jwt.sign({ id: admin._id, v: 0 }, process.env.JWT_SECRET)}`, "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body) });
        const json = async (response, status = 200) => { assert.equal(response.status, status, await response.clone().text()); return response.json(); };
        const payload = { title: "CI Safari", type: "Safari", date: day, startTime: "06:00", participants: 2,
            supplierName: "CI Jeep Provider", supplierEmail: "safari@example.invalid", meetingPoint: "Hotel lobby",
            followUpDate: day, guestInstructions: "Bring a hat", internalNotes: "Private margin note" };
        assert.equal((await request(base, "POST", { ...payload, expectedVersion: 0 }, admins[1])).status, 403);
        let result = await json(await request(base, "POST", { ...payload, expectedVersion: 0, status: "Confirmed" }), 201);
        const id = result.items[0]._id;
        assert.equal(result.items[0].status, "Planned"); assert.equal(result.version, 1);
        assert.equal((await request(base, "POST", { ...payload, expectedVersion: 0 })).status, 409);
        assert.equal((await request(`${root}/${bookings[1]._id}/excursions/${id}`, "PUT", { ...payload, expectedVersion: 0 })).status, 404);
        assert.equal((await request(`${root}/${booking._id}`, "PUT", { numberOfTravelers: 1 })).status, 400);
        assert.equal((await request(`${root}/${booking._id}`, "PUT", { travelEndDate: "2000-01-01" })).status, 400);
        assert.equal((await request(`${root}/${booking._id}`, "DELETE")).status, 409);
        const read = await request(base, "GET", undefined, admins[1]);
        assert.equal(read.headers.get("cache-control"), "no-store"); await json(read);
        const move = async (status, extra = {}) => { result = await json(await request(`${base}/${id}/status`, "PATCH", { status, expectedVersion: result.version, confirmed: true, ...extra })); };
        await move("Requested");
        const schedulePath = `${root}/excursion-schedule?from=${day}&to=${endDay}`;
        let schedule = await json(await request(`${schedulePath}&attention=followup`));
        assert.equal(schedule.total, 1); assert.equal(schedule.summary.followUpDue, 1);
        assert.equal(schedule.items[0].bookingCode, booking.bookingCode);
        assert.equal(JSON.stringify(schedule).includes("Private margin note"), false);
        assert.equal(JSON.stringify(schedule).includes("activity-private@example.invalid"), false);
        assert.equal(JSON.stringify(schedule).includes("history"), false);
        const cancellation = await json(await request(`${base}/${id}/message?audience=cancellation`));
        assert.match(cancellation.body, /Please cancel/);
        assert.equal((await Booking.findById(booking._id)).excursions[0].status, "Requested");
        await move("Confirmed", { confirmationReference: "CI-SAF-123" });
        const guest = await json(await request(`${base}/${id}/message?audience=guest`));
        assert.match(guest.body, /Bring a hat/); assert.equal(guest.body.includes("Private margin note"), false);
        assert.equal((await request(`${base}/${id}/message?audience=guest`, "GET", undefined, admins[1])).status, 403);
        result = await json(await request(`${base}/${id}`, "PUT", { ...payload, startTime: "06:30", expectedVersion: result.version }));
        assert.equal(result.items[0].status, "Requested"); assert.equal(result.items[0].confirmationReference, "");
        await move("Confirmed", { confirmationReference: "CI-SAF-124" });
        await move("Completed");
        assert.equal((await json(await request(schedulePath))).total, 0);
        assert.equal((await json(await request(`${schedulePath}&status=Completed`))).total, 1);
        assert.equal((await request(`${base}/${id}`, "PUT", { ...payload, expectedVersion: result.version })).status, 409);
        // A second future activity exercises cancellation after the whole booking is cancelled.
        result = await json(await request(base, "POST", { ...payload, date: endDay, expectedVersion: result.version }), 201);
        const futureId = result.items[1]._id;
        const changeFuture = async (status, extra = {}) => { result = await json(await request(`${base}/${futureId}/status`, "PATCH", { status, expectedVersion: result.version, confirmed: true, ...extra })); };
        await changeFuture("Requested"); await changeFuture("Confirmed", { confirmationReference: "CI-FUTURE" });
        assert.equal((await request(`${base}/${futureId}/status`, "PATCH", { status: "Completed", expectedVersion: result.version, confirmed: true })).status, 400);
        await Booking.updateOne({ _id: booking._id }, { $set: { bookingStatus: "Cancelled" } });
        schedule = await json(await request(`${schedulePath}&attention=cancellation`));
        assert.equal(schedule.total, 1); assert.equal(schedule.items[0]._id, futureId);
        await json(await request(`${base}/${futureId}/message?audience=cancellation`));
        await changeFuture("Cancellation requested", { note: "Guest cancelled the trip" });
        await changeFuture("Cancelled", { note: "Supplier acknowledged, no fee" });
        assert.equal((await json(await request(`${schedulePath}&attention=cancellation`))).total, 0);
        assert.equal((await request(base, "POST", { ...payload, expectedVersion: result.version })).status, 409);
        const audit = await ActivityLog.find({ relatedRecordId: booking._id }).lean();
        assert.ok(audit.length >= 10); assert.equal(JSON.stringify(audit).includes("Private margin note"), false);
        console.log("Activities persist through booking lifecycle, preserve history, enforce permissions and revisions, and produce private-safe schedules and drafts.");
    } finally {
        const ids = bookings.map((booking) => booking._id);
        await ActivityLog.deleteMany({ relatedRecordId: { $in: ids } });
        await Booking.deleteMany({ _id: { $in: ids } });
        await Admin.deleteMany({ _id: { $in: admins.map((admin) => admin._id) } });
        await mongoose.disconnect();
    }
};
main().catch((error) => { console.error(error); process.exitCode = 1; });
