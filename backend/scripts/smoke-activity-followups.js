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
        for (const role of ["Sales", "Viewer"]) admins.push(await Admin.create({ name: `CI Followups ${role}`,
            email: `ci-activity-followup-${role}-${Date.now()}@example.invalid`, password: "disposable-ci-only-password", role }));
        const day = today();
        const offset = (n) => { const date = new Date(day); date.setUTCDate(date.getUTCDate() + n); return date.toISOString().slice(0, 10); };
        for (let i = 0; i < 2; i++) bookings.push(await Booking.create({ bookingCode: `CI-ACT-FOLLOW-${Date.now()}-${i}`,
            customer: { fullName: "Followup Guest", email: "private-guest@example.invalid", whatsappNumber: "+94771234567", country: "UK" },
            travelStartDate: offset(120), travelEndDate: offset(124), numberOfTravelers: 2, totalPrice: 900, bookingStatus: "Confirmed" }));
        const booking = bookings[0], root = "http://127.0.0.1:5000/api/bookings", base = `${root}/${booking._id}/excursions`;
        const request = (path, method = "GET", body, admin = admins[0]) => fetch(path, { method,
            headers: { Authorization: `Bearer ${jwt.sign({ id: admin._id, v: 0 }, process.env.JWT_SECRET)}`, "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body) });
        const json = async (response, status = 200) => { assert.equal(response.status, status, await response.clone().text()); return response.json(); };
        const queue = async (filter = "all", page = 1) => {
            const response = await request(`${root}/supplier-confirmations?type=activity&dateFilter=${filter}&page=${page}`);
            assert.equal(response.headers.get("cache-control"), "no-store"); return json(response);
        };
        const payload = { title: "Future safari", type: "Safari", date: offset(120), startTime: "06:00", participants: 2,
            supplierName: "CI Jeep Provider", supplierEmail: "private-supplier@example.invalid", meetingPoint: "Hotel lobby",
            internalNotes: "PRIVATE ACTIVITY NOTE" };
        let data = await json(await request(base, "POST", { ...payload, expectedVersion: 0 }), 201);
        const id = data.items[0]._id, contactUrl = `${root}/${booking._id}/supplier-contacts/activity/${id}`;
        assert.equal((await queue()).total, 0, "Unsent plans are not supplier requests");
        data = await json(await request(`${base}/${id}/status`, "PATCH", { status: "Requested", confirmed: true, expectedVersion: data.version }));
        let pending = await queue("noDue");
        assert.equal(pending.total, 1); assert.equal(pending.summary.activities, 1);
        assert.equal(pending.items[0]._id, id, "Future trips must appear without a service-date window");
        const oldVersion = data.version;
        const body = { channel: "Phone", note: "PRIVATE CONTACT NOTE", nextFollowUpDate: day, expectedVersion: oldVersion };
        assert.equal((await request(contactUrl, "POST", body, admins[1])).status, 403);
        assert.equal((await request(contactUrl.replace(String(booking._id), String(bookings[1]._id)), "POST", body)).status, 404);
        const history = await json(await request(contactUrl, "GET", undefined, admins[1]));
        assert.equal(history.version, oldVersion); assert.deepEqual(history.contacts, []);
        const attempts = await Promise.all([request(contactUrl, "POST", body), request(contactUrl, "POST", body)]);
        assert.deepEqual(attempts.map((r) => r.status).sort(), [200, 409], "Concurrent contacts must not overwrite follow-up or duplicate the same revision");
        data = await json(await request(base));
        assert.equal(data.version, oldVersion + 1); assert.equal(data.items[0].contacts.length, 1);
        assert.equal(data.items[0].status, "Requested");
        assert.equal((await request(`${base}/${id}`, "PUT", { ...payload, expectedVersion: oldVersion })).status, 409);
        pending = await queue("today"); assert.equal(pending.total, 1);
        assert.equal((await queue("actionable")).total, 1);
        assert.equal(pending.items[0].lastContactChannel, "Phone"); assert.ok(pending.items[0].lastContactedAt);
        for (const privateValue of [body.note, payload.internalNotes, payload.supplierEmail, "private-guest@example.invalid"]) {
            assert.equal(JSON.stringify(pending).includes(privateValue), false);
        }
        // Changing the reservation makes an already open contact form stale as well.
        data = await json(await request(`${base}/${id}`, "PUT", { ...payload, startTime: "06:30", expectedVersion: data.version }));
        assert.equal((await request(contactUrl, "POST", { ...body, expectedVersion: data.version - 1 })).status, 409);
        let contact = await json(await request(contactUrl, "POST", { ...body, nextFollowUpDate: null, expectedVersion: data.version }));
        assert.equal((await queue("noDue")).total, 1);
        contact = await json(await request(contactUrl, "POST", { ...body, nextFollowUpDate: offset(1), expectedVersion: contact.version }));
        assert.equal((await queue("upcoming")).total, 1); assert.equal((await queue("actionable")).total, 0);
        data = await json(await request(`${base}/${id}/status`, "PATCH", { status: "Confirmed", confirmed: true,
            confirmationReference: "CI-SAFARI-1", expectedVersion: contact.version }));
        assert.equal((await queue()).total, 0); assert.equal(data.items[0].contacts.length, 3);
        assert.equal((await request(contactUrl, "POST", { ...body, expectedVersion: data.version })).status, 409);
        const guest = await json(await request(`${base}/${id}/message?audience=guest`));
        assert.equal(guest.body.includes(body.note), false);
        const audit = await ActivityLog.find({ relatedRecordId: booking._id, description: /Activity supplier contact logged/ }).lean();
        assert.equal(audit.length, 3); assert.equal(JSON.stringify(audit).includes(body.note), false);

        // Exercise MongoDB pagination, all due filters, status exclusion and legacy empty histories.
        const fixtures = Array.from({ length: 21 }, (_, i) => ({ ...payload, title: `Queue ${i}`, status: "Requested",
            followUpDate: i < 7 ? null : i < 14 ? day : offset(-1) }));
        fixtures.push(...["Planned", "Confirmed", "Completed", "Cancellation requested", "Cancelled"].map((status) => ({ ...payload, status })));
        await Booking.updateOne({ _id: bookings[1]._id }, { $set: { excursions: fixtures } });
        const first = await queue(), second = await queue("all", 2);
        assert.equal(first.total, 21); assert.equal(first.totalPages, 2); assert.equal(first.items.length, 20);
        assert.equal(second.items.length, 1);
        assert.equal(new Set([...first.items, ...second.items].map((item) => item._id)).size, 21);
        assert.equal(first.summary.activities, 21); assert.equal(first.summary.today, 7); assert.equal(first.summary.overdue, 7);
        assert.equal((await queue("noDue")).total, 7); assert.equal((await queue("overdue")).total, 7);
        assert.equal((await queue("actionable")).total, 14);
        for (const status of ["Cancelled", "Completed"]) {
            await Booking.updateOne({ _id: bookings[1]._id }, { $set: { bookingStatus: status } });
            assert.equal((await queue()).total, 0, "Closed trips are excluded from confirmation follow-up");
        }
        console.log("Activity supplier follow-ups: future trips, contact history, privacy, concurrent edits, pagination and status filters passed.");
    } finally {
        const ids = bookings.map((booking) => booking._id);
        await ActivityLog.deleteMany({ relatedRecordId: { $in: ids } });
        await Booking.deleteMany({ _id: { $in: ids } });
        await Admin.deleteMany({ _id: { $in: admins.map((admin) => admin._id) } });
        await mongoose.disconnect();
    }
};
main().catch((error) => { console.error(error); process.exitCode = 1; });
