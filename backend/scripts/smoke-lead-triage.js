const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const Inquiry = require("../models/Inquiry");
const Booking = require("../models/Booking");
const ActivityLog = require("../models/ActivityLog");

const main = async () => {
    if (process.env.CI_SMOKE_TESTS !== "true") throw new Error("Enable disposable CI smoke tests explicitly.");
    await mongoose.connect(process.env.MONGO_URI);
    const ids = [];
    let sales;
    let viewer;
    let booking;
    try {
        sales = await Admin.create({ name: "CI Lead Owner", email: `ci-owner-${Date.now()}@example.invalid`, password: "disposable-ci-only-password", role: "Sales" });
        viewer = await Admin.create({ name: "CI Lead Viewer", email: `ci-viewer-${Date.now()}@example.invalid`, password: "disposable-ci-only-password", role: "Viewer" });
        const base = "http://127.0.0.1:5000/api/inquiries";
        const request = (path, method = "GET", body, actor = sales) => fetch(base + path, {
            method,
            headers: { Authorization: `Bearer ${jwt.sign({ id: actor._id, v: 0 }, process.env.JWT_SECRET)}`, "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const guest = { fullName: "CI Lead", email: `ci-repeat-${Date.now()}@example.invalid`, whatsappNumber: "+94771234567", country: "UK", message: "CI triage" };
        const older = await Inquiry.create({ ...guest, source: "Website" });
        ids.push(older._id);
        const newer = await Inquiry.create({ ...guest, source: "Referral", assignedTo: sales._id });
        ids.push(newer._id);
        booking = await Booking.create({ bookingCode: `CI-LEAD-REPEAT-${Date.now()}`,
            customer: { fullName: "Prior guest", email: guest.email,
                whatsappNumber: "+94770000001", country: "UK" },
            travelStartDate: new Date("2027-03-01"), travelEndDate: new Date("2027-03-07"),
            numberOfTravelers: 1, totalPrice: 1000 });
        await Inquiry.collection.updateOne({ _id: older._id }, { $set: { createdAt: new Date("2026-01-01") } });

        assert.equal((await request("/triage", "GET", undefined, viewer)).status, 200);
        const queue = await (await request("/triage?filter=all")).json();
        assert.deepEqual(queue.summary, { all: 2, unassigned: 1, mine: 1 });
        assert.equal(queue.items[0]._id, String(older._id), "oldest new lead appears first");
        assert.equal(queue.items[0].relatedInquiryCount, 1);
        assert.equal(queue.items[1].relatedInquiryCount, 1);
        assert.equal(queue.items[0].relatedBookingCount, 1);
        assert.equal(JSON.stringify(queue).includes(booking.bookingCode), false,
            "Triage context shows counts without booking details");
        assert.equal((await (await request("/triage?filter=unassigned")).json()).total, 1);
        assert.equal((await (await request("/triage?filter=mine")).json()).items[0]._id, String(newer._id));
        assert.equal((await request("/attention", "GET", undefined, viewer)).status, 403);
        const attention = await (await request("/attention")).json();
        assert.deepEqual(attention.summary, { total: 2, unassigned: 1, mine: 1, waiting24h: 1 });
        assert.equal(attention.items[0]._id, String(older._id));
        assert.equal(attention.items[0].waiting24h, true);
        assert.equal((await request("/triage?filter=closed")).status, 400);
        const eligible = await (await request("/assignees")).json();
        assert.ok(eligible.admins.some((person) => person._id === String(sales._id)));
        assert.equal(eligible.admins.some((person) => person._id === String(viewer._id)), false);
        assert.equal((await request(`/${older._id}/assignee`, "PATCH", { assignedTo: viewer._id })).status, 400);
        assert.equal((await request(`/${older._id}/assignee`, "PATCH", { assignedTo: sales._id }, viewer)).status, 403);
        const assigned = await request(`/${older._id}/assignee`, "PATCH", { assignedTo: String(sales._id) });
        assert.equal(assigned.status, 200, await assigned.clone().text());
        assert.equal((await assigned.json()).inquiry.assignedTo._id, String(sales._id));
        assert.equal((await request(`/${older._id}/assignee`, "PATCH", { assignedTo: null })).status, 200);

        assert.equal((await request(`/${older._id}/contacted`, "PATCH", { channel: "Email" }, viewer)).status, 403);
        assert.equal((await request(`/${older._id}/contacted`, "PATCH", { channel: "Text" })).status, 400);
        const first = await request(`/${older._id}/contacted`, "PATCH", { channel: "WhatsApp" });
        assert.equal(first.status, 200, await first.clone().text());
        const contacted = (await first.json()).inquiry;
        assert.equal(contacted.status, "Contacted");
        assert.equal(contacted.assignedTo._id, String(sales._id));
        assert.equal(contacted.firstContactChannel, "WhatsApp");
        assert.equal(contacted.firstContactBy, String(sales._id));
        assert.ok(contacted.firstContactAt);
        assert.equal((await request(`/${older._id}/contacted`, "PATCH", { channel: "Phone" })).status, 409);
        assert.equal((await (await request("/triage")).json()).summary.all, 1);
        assert.deepEqual((await (await request("/attention")).json()).summary,
            { total: 1, unassigned: 0, mine: 1, waiting24h: 0 });

        assert.equal((await request(`/${older._id}`, "PUT", { status: "New" })).status, 200);
        const again = await request(`/${older._id}/contacted`, "PATCH", { channel: "Phone" });
        assert.equal(again.status, 200, await again.clone().text());
        const reopened = (await again.json()).inquiry;
        assert.equal(reopened.firstContactAt, contacted.firstContactAt);
        assert.equal(reopened.firstContactChannel, "WhatsApp");
        assert.equal((await request(`/${newer._id}`, "PUT", { status: "Cancelled", lossReason: "Budget" })).status, 200);
        assert.equal((await request(`/${newer._id}/assignee`, "PATCH", { assignedTo: sales._id })).status, 409);
        assert.equal((await (await request("/triage")).json()).summary.all, 0);
        assert.deepEqual((await (await request("/attention")).json()).summary,
            { total: 0, unassigned: 0, mine: 0, waiting24h: 0 });
        console.log("Lead triage smoke passed: owner eligibility, oldest first, filters, atomic contact, reopening, and access control.");
    } finally {
        if (ids.length) {
            await ActivityLog.deleteMany({ relatedRecordId: { $in: ids } });
            await Inquiry.deleteMany({ _id: { $in: ids } });
        }
        if (booking) await Booking.deleteOne({ _id: booking._id });
        if (sales) await Admin.deleteOne({ _id: sales._id });
        if (viewer) await Admin.deleteOne({ _id: viewer._id });
        await mongoose.disconnect();
    }
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
