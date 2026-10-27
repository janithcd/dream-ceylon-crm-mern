const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const ActivityLog = require("../models/ActivityLog");

const dateOnly = (instant) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(instant).map(({ type, value }) => [type, value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
};

const main = async () => {
    if (process.env.CI_SMOKE_TESTS !== "true") throw new Error("This smoke test must be explicitly enabled in CI");
    await mongoose.connect(process.env.MONGO_URI);
    const admins = [];
    let booking;
    try {
        for (const [index, role] of ["Sales", "Viewer", "Sales"].entries()) admins.push(await Admin.create({
            name: `CI Trip Support ${role} ${index}`, email: `ci-trip-support-${role}-${index}-${Date.now()}@example.invalid`,
            password: "disposable-ci-only-password", role,
        }));
        booking = await Booking.create({
            bookingCode: `CI-TRIP-SUPPORT-${Date.now()}`, bookingStatus: "In Progress",
            customer: { fullName: "CI Guest", email: "private-trip-support@example.invalid", whatsappNumber: "+94771234567", country: "UK" },
            travelStartDate: new Date(dateOnly(new Date())), travelEndDate: new Date(dateOnly(new Date(Date.now() + 86400000))),
            numberOfTravelers: 2, totalPrice: 1200, adminNotes: "PRIVATE-TRIP-SUPPORT-NOTE",
        });
        const [sales, viewer, teammate] = admins;
        const request = (admin, path, method = "GET", body) => fetch(`http://127.0.0.1:5000/api/bookings${path}`, {
            method, headers: { Authorization: `Bearer ${jwt.sign({ id: admin._id, v: 0 }, process.env.JWT_SECRET)}`,
                "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const queue = async (filter, admin = viewer) => {
            const response = await request(admin, `/trip-support?filter=${filter}`);
            assert.equal(response.status, 200, await response.clone().text());
            assert.equal(response.headers.get("cache-control"), "no-store");
            return response.json();
        };
        const alerts = async (admin = viewer) => {
            const response = await request(admin, "/trip-support/alerts");
            assert.equal(response.status, 200, await response.clone().text());
            assert.equal(response.headers.get("cache-control"), "no-store");
            const result = await response.json();
            for (const secret of ["PRIVATE guest", "Vehicle arrived late", "private-trip-support@example.invalid", "PRIVATE-TRIP-SUPPORT-NOTE"]) {
                assert.ok(!JSON.stringify(result).includes(secret), `Alert exposed ${secret}`);
            }
            return result;
        };
        const attention = async (admin = viewer) => {
            const response = await request(admin, "/trip-support/attention?page=1");
            assert.equal(response.status, 200, await response.clone().text());
            assert.equal(response.headers.get("cache-control"), "no-store");
            const result = await response.json();
            assert.equal(result.filter, "attention");
            assert.ok(!JSON.stringify(result).includes("PRIVATE guest"), "Worklist exposed a private issue note");
            return result;
        };
        assert.ok((await queue("active")).items.some((item) => item.bookingCode === booking.bookingCode));
        const path = `/${booking._id}/trip-issues`;
        const input = { title: "Vehicle arrived late", category: "Transport", priority: "Urgent",
            note: "PRIVATE guest waited at pickup", nextFollowUpDate: dateOnly(new Date(Date.now() + 86400000)) };
        assert.equal((await request(viewer, path, "POST", input)).status, 403);
        const created = await request(sales, path, "POST", input);
        assert.equal(created.status, 201, await created.clone().text());
        const issueId = (await created.json()).issue._id;
        assert.ok((await queue("mine", sales)).items.some((item) => item.bookingCode === booking.bookingCode));
        assert.ok(!(await queue("mine", teammate)).items.some((item) => item.bookingCode === booking.bookingCode));
        assert.equal((await alerts(sales)).summary.count, 1);
        assert.equal((await alerts(teammate)).summary.count, 0);
        assert.equal((await alerts(viewer)).summary.count, 0);
        assert.equal((await attention(sales)).items[0].bookingCode, booking.bookingCode);
        assert.equal((await attention(teammate)).total, 0);
        assert.equal((await request(sales, "/trip-support/attention?page=0")).status, 400);
        const ordinaryList = await request(viewer, `?keyword=${encodeURIComponent(booking.bookingCode)}`);
        assert.equal(ordinaryList.status, 200);
        assert.ok(!JSON.stringify(await ordinaryList.json()).includes("PRIVATE guest"), "Ordinary booking list must exclude issue notes");
        const open = await queue("open");
        const item = open.items.find((value) => value.bookingCode === booking.bookingCode);
        assert.equal(item.openIssueCount, 1);
        assert.equal(item.urgentIssueCount, 1);
        for (const secret of ["PRIVATE guest", "Vehicle arrived late", "private-trip-support@example.invalid", "PRIVATE-TRIP-SUPPORT-NOTE"]) {
            assert.ok(!JSON.stringify(open).includes(secret), `Queue exposed ${secret}`);
        }
        const ownerPath = `${path}/${issueId}/assignee`;
        assert.equal((await request(viewer, ownerPath, "PATCH", { assignedTo: null, expectedRevision: 0 })).status, 403);
        assert.equal((await request(sales, ownerPath, "PATCH", { assignedTo: viewer._id.toString(), expectedRevision: 0 })).status, 400);
        const unassigned = await request(sales, ownerPath, "PATCH", { assignedTo: null, expectedRevision: 0 });
        assert.equal(unassigned.status, 200, await unassigned.clone().text());
        assert.ok((await queue("unassigned")).items.some((value) => value.bookingCode === booking.bookingCode));
        const unassignedAlert = await alerts(viewer);
        assert.equal(unassignedAlert.summary.count, 1);
        assert.equal(unassignedAlert.summary.unassigned, 1);
        assert.equal(unassignedAlert.items[0].bookingCode, booking.bookingCode);
        assert.equal((await attention(viewer)).summary.unassigned, 1);
        assert.equal((await request(sales, ownerPath, "PATCH", { assignedTo: teammate._id.toString(), expectedRevision: 0 })).status, 409);
        const assign = await request(sales, ownerPath, "PATCH", { assignedTo: teammate._id.toString(), expectedRevision: 1 });
        assert.equal(assign.status, 200, await assign.clone().text());
        assert.equal((await assign.json()).issue.assignedToName, teammate.name);
        assert.ok((await queue("mine", teammate)).items.some((value) => value.bookingCode === booking.bookingCode));
        assert.ok(!(await queue("unassigned")).items.some((value) => value.bookingCode === booking.bookingCode));
        assert.equal((await alerts(sales)).summary.count, 0);
        assert.equal((await alerts(teammate)).summary.urgent, 1);
        await Booking.updateOne({ _id: booking._id, "tripIssues._id": issueId },
            { $set: { "tripIssues.$.priority": "Normal", "tripIssues.$.nextFollowUpDate": new Date(dateOnly(new Date())) } });
        assert.equal((await alerts(teammate)).summary.dueToday, 1);
        assert.equal((await attention(teammate)).items[0].dueToday, 1);
        await Booking.updateOne({ _id: booking._id, "tripIssues._id": issueId },
            { $set: { "tripIssues.$.priority": "Urgent", "tripIssues.$.nextFollowUpDate": new Date(dateOnly(new Date(Date.now() - 86400000))) } });
        assert.equal((await alerts(teammate)).summary.overdue, 1);
        assert.equal((await attention(teammate)).items[0].count, 1);
        const update = await request(sales, `${path}/${issueId}`, "PATCH", { action: "updated",
            note: "PRIVATE guide dispatched", nextFollowUpDate: null, expectedRevision: 2 });
        assert.equal(update.status, 200, await update.clone().text());
        assert.equal((await update.json()).issue.revision, 3);
        assert.equal((await request(sales, `${path}/${issueId}`, "PATCH", { action: "resolved",
            note: "Driver apologized to guest", nextFollowUpDate: null, expectedRevision: 0 })).status, 409);
        await Booking.updateOne({ _id: booking._id }, { $set: { bookingStatus: "Completed" } });
        assert.equal((await request(sales, path, "POST", input)).status, 409);
        assert.ok((await queue("open")).items.some((value) => value.bookingCode === booking.bookingCode));
        const resolve = await request(sales, `${path}/${issueId}`, "PATCH", { action: "resolved",
            note: "Driver apologized and guest accepted", nextFollowUpDate: null, expectedRevision: 3 });
        assert.equal(resolve.status, 200, await resolve.clone().text());
        assert.ok(!(await queue("open")).items.some((value) => value.bookingCode === booking.bookingCode));
        assert.equal((await alerts(teammate)).summary.count, 0);
        assert.equal((await attention(teammate)).total, 0);
        const detail = await request(viewer, path);
        assert.equal(detail.status, 200);
        assert.equal((await detail.json()).issues[0].events.length, 5);
        const logs = await ActivityLog.find({ relatedRecordId: booking._id });
        assert.equal(logs.length, 5);
        assert.ok(!JSON.stringify(logs).includes("PRIVATE guest"));
        assert.ok(!JSON.stringify(logs).includes("PRIVATE guide"));
        console.log("Trip support queue, issue lifecycle, privacy, permissions and stale-write checks passed.");
    } finally {
        if (booking) {
            await ActivityLog.deleteMany({ relatedRecordId: booking._id });
            await Booking.deleteOne({ _id: booking._id });
        }
        if (admins.length) await Admin.deleteMany({ _id: { $in: admins.map((item) => item._id) } });
        await mongoose.disconnect();
    }
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
