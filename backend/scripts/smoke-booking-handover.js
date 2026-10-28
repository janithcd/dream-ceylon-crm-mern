const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const BookingHandoverRead = require("../models/BookingHandoverRead");
const ActivityLog = require("../models/ActivityLog");

const main = async () => {
    if (process.env.CI_SMOKE_TESTS !== "true") throw new Error("This smoke test must be explicitly enabled in CI");
    await mongoose.connect(process.env.MONGO_URI);
    const admins = [];
    let booking;
    try {
        for (const role of ["Sales", "Viewer", "Super Admin"]) admins.push(await Admin.create({
            name: `CI Handover ${role}`, email: `ci-handover-${role}-${Date.now()}@example.invalid`,
            password: "disposable-ci-only-password", role,
        }));
        booking = await Booking.create({ bookingCode: `CI-HANDOVER-${Date.now()}`,
            customer: { fullName: "CI Guest", email: "private-handover@example.invalid",
                whatsappNumber: "+94771234567", country: "UK" },
            travelStartDate: new Date("2027-03-01"), travelEndDate: new Date("2027-03-07"),
            numberOfTravelers: 1, totalPrice: 500, adminNotes: "PRIVATE EXISTING ADMIN NOTES",
        });
        const request = (admin, path, method = "GET", body) => fetch(`http://127.0.0.1:5000/api/bookings${path}`, {
            method, headers: { Authorization: `Bearer ${jwt.sign({ id: admin._id, v: 0 }, process.env.JWT_SECRET)}`,
                "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
        });
        const [sales, viewer, superAdmin] = admins;
        const path = `/${booking._id}/handover-notes`;
        assert.equal((await request(sales, `${path}?page=0`)).status, 400);
        assert.equal((await request(viewer, path, "POST", { text: "Private shift note" })).status, 403);
        const empty = await request(viewer, path);
        assert.equal(empty.status, 200, await empty.clone().text());
        assert.equal(empty.headers.get("cache-control"), "no-store");
        assert.equal((await empty.json()).total, 0);
        const privateText = "PRIVATE: Flight delayed; please call guest on arrival.";
        const added = await request(sales, path, "POST", { text: privateText });
        assert.equal(added.status, 201, await added.clone().text());
        assert.equal((await added.json()).note.text, privateText);
        const notes = await (await request(viewer, path)).json();
        assert.equal(notes.total, 1);
        assert.equal(notes.notes[0].text, privateText);
        assert.equal(notes.notes[0].createdByName, "CI Handover Sales");
        const worklist = await request(viewer, "/handover-worklist");
        assert.equal(worklist.status, 200, await worklist.clone().text());
        assert.equal(worklist.headers.get("cache-control"), "no-store");
        const worklistData = await worklist.json();
        const worklistItem = worklistData.items.find((item) => String(item.bookingId) === String(booking._id));
        assert.ok(worklistItem);
        assert.equal(worklistItem.unreadCount, 1);
        const unreadBefore = await (await request(viewer, "/handover-worklist?filter=unread")).json();
        assert.ok(unreadBefore.items.some((item) => String(item.bookingId) === String(booking._id)));
        assert.equal(JSON.stringify(worklistData).includes(privateText), false);
        assert.equal(JSON.stringify(worklistData).includes("private-handover@example.invalid"), false);
        assert.equal(JSON.stringify(worklistData).includes("PRIVATE EXISTING ADMIN NOTES"), false);
        const seenPath = `${path}/seen`;
        assert.equal((await request(viewer, seenPath, "PATCH", { latestNoteId: "invalid" })).status, 400);
        assert.equal((await request(viewer, seenPath, "PATCH", { latestNoteId: new mongoose.Types.ObjectId() })).status, 409);
        const acknowledged = await request(viewer, seenPath, "PATCH", { latestNoteId: notes.notes[0].id });
        assert.equal(acknowledged.status, 200, await acknowledged.clone().text());
        assert.equal((await BookingHandoverRead.findOne({ booking: booking._id, admin: viewer._id })).seenCount, 1);
        const unreadAfter = await (await request(viewer, "/handover-worklist?filter=unread")).json();
        assert.ok(!unreadAfter.items.some((item) => String(item.bookingId) === String(booking._id)));
        const secondText = "PRIVATE: The guide has a new pickup time.";
        const second = await request(sales, path, "POST", { text: secondText });
        assert.equal(second.status, 201, await second.clone().text());
        const secondId = (await second.json()).note.id;
        const afterNewNote = await (await request(viewer, "/handover-worklist?filter=unread")).json();
        assert.equal(afterNewNote.items.find((item) => String(item.bookingId) === String(booking._id)).unreadCount, 1);
        assert.equal(JSON.stringify(afterNewNote).includes(secondText), false);
        assert.equal((await request(viewer, seenPath, "PATCH", { latestNoteId: notes.notes[0].id })).status, 200);
        assert.equal((await BookingHandoverRead.findOne({ booking: booking._id, admin: viewer._id })).seenCount, 1,
            "An older acknowledgement must leave a newer note unread");
        assert.equal((await request(viewer, seenPath, "PATCH", { latestNoteId: secondId })).status, 200);
        assert.equal((await BookingHandoverRead.findOne({ booking: booking._id, admin: viewer._id })).seenCount, 2);
        const salesUnread = await (await request(sales, "/handover-worklist?filter=unread")).json();
        assert.equal(salesUnread.items.find((item) => String(item.bookingId) === String(booking._id)).unreadCount, 2,
            "Read markers belong to each staff member");
        await Booking.updateOne({ _id: booking._id }, { $set: { bookingStatus: "Completed" } });
        const activeWorklist = await (await request(viewer, "/handover-worklist")).json();
        assert.ok(!activeWorklist.items.some((item) => String(item.bookingId) === String(booking._id)));
        const allWorklist = await (await request(viewer, "/handover-worklist?filter=all")).json();
        assert.ok(allWorklist.items.some((item) => String(item.bookingId) === String(booking._id)));
        assert.equal((await Booking.findById(booking._id)).handoverNotes, undefined,
            "Private notes stay out of ordinary booking reads");
        const broad = await request(viewer, `?keyword=${encodeURIComponent(booking.bookingCode)}`);
        assert.equal(broad.status, 200, await broad.clone().text());
        assert.equal(JSON.stringify(await broad.json()).includes(privateText), false);
        const detail = await request(viewer, `/${booking._id}`);
        assert.equal(detail.status, 200, await detail.clone().text());
        assert.equal(JSON.stringify(await detail.json()).includes(privateText), false);
        const activity = await request(viewer, `/${booking._id}/activity`);
        assert.equal(activity.status, 200, await activity.clone().text());
        assert.equal(JSON.stringify(await activity.json()).includes(privateText), false);
        assert.equal((await request(superAdmin, `/${booking._id}`, "DELETE")).status, 409,
            "Bookings with handover history must be cancelled instead of deleted");
        const log = await ActivityLog.findOne({ relatedRecordId: booking._id, description: /Internal handover note added/ });
        assert.ok(log);
        assert.equal(JSON.stringify(log).includes(privateText), false);
        console.log("Private handover notes persist, stay out of broad reads, and protect booking history.");
    } finally {
        if (booking) {
            await ActivityLog.deleteMany({ relatedRecordId: booking._id });
            await BookingHandoverRead.deleteMany({ booking: booking._id });
            await Booking.deleteOne({ _id: booking._id });
        }
        if (admins.length) await Admin.deleteMany({ _id: { $in: admins.map((admin) => admin._id) } });
        await mongoose.disconnect();
    }
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
