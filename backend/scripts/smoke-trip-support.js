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
        for (const role of ["Sales", "Viewer"]) admins.push(await Admin.create({
            name: `CI Trip Support ${role}`, email: `ci-trip-support-${role}-${Date.now()}@example.invalid`,
            password: "disposable-ci-only-password", role,
        }));
        booking = await Booking.create({
            bookingCode: `CI-TRIP-SUPPORT-${Date.now()}`, bookingStatus: "In Progress",
            customer: { fullName: "CI Guest", email: "private-trip-support@example.invalid", whatsappNumber: "+94771234567", country: "UK" },
            travelStartDate: new Date(dateOnly(new Date())), travelEndDate: new Date(dateOnly(new Date(Date.now() + 86400000))),
            numberOfTravelers: 2, totalPrice: 1200, adminNotes: "PRIVATE-TRIP-SUPPORT-NOTE",
        });
        const [sales, viewer] = admins;
        const request = (admin, path, method = "GET", body) => fetch(`http://127.0.0.1:5000/api/bookings${path}`, {
            method, headers: { Authorization: `Bearer ${jwt.sign({ id: admin._id, v: 0 }, process.env.JWT_SECRET)}`,
                "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const queue = async (filter) => {
            const response = await request(viewer, `/trip-support?filter=${filter}`);
            assert.equal(response.status, 200, await response.clone().text());
            assert.equal(response.headers.get("cache-control"), "no-store");
            return response.json();
        };
        assert.ok((await queue("active")).items.some((item) => item.bookingCode === booking.bookingCode));
        const path = `/${booking._id}/trip-issues`;
        const input = { title: "Vehicle arrived late", category: "Transport", priority: "Urgent",
            note: "PRIVATE guest waited at pickup", nextFollowUpDate: dateOnly(new Date(Date.now() + 86400000)) };
        assert.equal((await request(viewer, path, "POST", input)).status, 403);
        const created = await request(sales, path, "POST", input);
        assert.equal(created.status, 201, await created.clone().text());
        const issueId = (await created.json()).issue._id;
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
        const update = await request(sales, `${path}/${issueId}`, "PATCH", { action: "updated",
            note: "PRIVATE guide dispatched", nextFollowUpDate: null, expectedRevision: 0 });
        assert.equal(update.status, 200, await update.clone().text());
        assert.equal((await update.json()).issue.revision, 1);
        assert.equal((await request(sales, `${path}/${issueId}`, "PATCH", { action: "resolved",
            note: "Driver apologized to guest", nextFollowUpDate: null, expectedRevision: 0 })).status, 409);
        await Booking.updateOne({ _id: booking._id }, { $set: { bookingStatus: "Completed" } });
        assert.equal((await request(sales, path, "POST", input)).status, 409);
        assert.ok((await queue("open")).items.some((value) => value.bookingCode === booking.bookingCode));
        const resolve = await request(sales, `${path}/${issueId}`, "PATCH", { action: "resolved",
            note: "Driver apologized and guest accepted", nextFollowUpDate: null, expectedRevision: 1 });
        assert.equal(resolve.status, 200, await resolve.clone().text());
        assert.ok(!(await queue("open")).items.some((value) => value.bookingCode === booking.bookingCode));
        const detail = await request(viewer, path);
        assert.equal(detail.status, 200);
        assert.equal((await detail.json()).issues[0].events.length, 3);
        const logs = await ActivityLog.find({ relatedRecordId: booking._id });
        assert.equal(logs.length, 3);
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
