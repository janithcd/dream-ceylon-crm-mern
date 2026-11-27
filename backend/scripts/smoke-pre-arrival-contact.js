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
    let otherBooking;
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
        const transferDate = new Date(dateOnly(booking.travelStartDate));
        const arrivalBooking = await Booking.findById(booking._id);
        arrivalBooking.transportAssignments.push({ route: "Airport arrival", status: "Confirmed",
            registration: "CI-ARR123", registrationKey: "CIARR123", startDate: transferDate, endDate: transferDate,
            chauffeurName: "CI Chauffeur", chauffeurPhone: "+94770000000", vehicleDescription: "Private van",
            flight: { direction: "Arrival", number: "UL505", date: transferDate, time: "08:30", airport: "CMB" },
        });
        arrivalBooking.itineraryDays.push({ date: transferDate, title: "Arrival day", plan: "Welcome to Sri Lanka" });
        await arrivalBooking.save();
        const guestTransferPath = `/${booking._id}/transport-assignments/${arrivalBooking.transportAssignments[0]._id}/guest-message`;
        otherBooking = await Booking.create({ bookingCode: `CI-OTHER-ARRIVAL-${Date.now()}`,
            bookingStatus: "Confirmed", customer: { fullName: "Private Other Guest", email: "private-other@example.invalid",
                whatsappNumber: "+94771111111", country: "UK" },
            travelStartDate: transferDate, travelEndDate: new Date(transferDate.getTime() + 86400000),
            numberOfTravelers: 1, totalPrice: 100,
            transportAssignments: [{ route: "Other service", status: "Confirmed", registration: "CI-ARR123",
                registrationKey: "CIARR123", startDate: transferDate, endDate: transferDate }],
        });
        const clashingResponse = await request(staff, draftPath);
        assert.equal(clashingResponse.status, 200, await clashingResponse.clone().text());
        const clashing = await clashingResponse.json();
        assert.doesNotMatch(clashing.message, /arrival transfer for flight/);
        assert.match(clashing.reviewItems.join(" "), /vehicle overlaps another confirmed service/);
        assert.equal(JSON.stringify(clashing).includes(otherBooking.bookingCode), false);
        assert.equal(JSON.stringify(clashing).includes("private-other@example.invalid"), false);
        const pickupClashingResponse = await request(staff, guestTransferPath);
        assert.equal(pickupClashingResponse.status, 200, await pickupClashingResponse.clone().text());
        const pickupClashing = await pickupClashingResponse.json();
        assert.match(pickupClashing.message, /Vehicle: To be confirmed/);
        assert.doesNotMatch(pickupClashing.message, /CI Chauffeur|CI-ARR123|\+94770000000/);
        assert.match(pickupClashing.reviewItems.join(" "), /overlaps another confirmed service/);
        assert.equal(JSON.stringify(pickupClashing).includes(otherBooking.bookingCode), false);
        const packUrl = `http://127.0.0.1:5000/api/booking-pdf/travel-pack/${booking._id}`;
        const packClashingResponse = await fetch(`${packUrl}/preview`, {
            headers: { Authorization: `Bearer ${jwt.sign({ id: staff._id, v: 0 }, process.env.JWT_SECRET)}` },
        });
        assert.equal(packClashingResponse.status, 200, await packClashingResponse.clone().text());
        const packClashing = await packClashingResponse.json();
        assert.equal(packClashing.ready, true);
        assert.match(packClashing.warnings.join(" "), /overlaps another confirmed service/);
        assert.doesNotMatch(JSON.stringify(packClashing.pack), /CI Chauffeur|CI-ARR123|\+94770000000/);
        assert.equal(JSON.stringify(packClashing).includes(otherBooking.bookingCode), false);
        const packDownload = await fetch(packUrl, { method: "POST",
            headers: { Authorization: `Bearer ${jwt.sign({ id: staff._id, v: 0 }, process.env.JWT_SECRET)}`, "Content-Type": "application/json" },
            body: JSON.stringify({ reviewed: true, fingerprint: packClashing.fingerprint }),
        });
        assert.equal(packDownload.status, 200, await packDownload.clone().text());
        assert.equal(Buffer.from(await packDownload.arrayBuffer()).subarray(0, 5).toString(), "%PDF-");
        const packRequest = (admin, path, method = "GET", body) => fetch(`${packUrl}${path}`, {
            method, headers: { Authorization: `Bearer ${jwt.sign({ id: admin._id, v: 0 }, process.env.JWT_SECRET)}`,
                "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
        });
        const deliveryPath = "/delivery";
        const packSent = { action: "sent", fingerprint: packClashing.fingerprint, channel: "Email", expectedRevision: 0 };
        assert.equal(packClashing.delivery.current, false);
        assert.equal((await packRequest(viewer, deliveryPath, "PATCH", packSent)).status, 403);
        const markedSent = await packRequest(staff, deliveryPath, "PATCH", packSent);
        assert.equal(markedSent.status, 200, await markedSent.clone().text());
        assert.equal((await markedSent.json()).delivery.current, true);
        assert.equal((await Booking.findById(booking._id)).travelPackDelivery.channel, "Email");
        assert.equal((await packRequest(staff, deliveryPath, "PATCH", packSent)).status, 409);
        await Booking.updateOne({ _id: otherBooking._id }, { $set: {
            "transportAssignments.0.registration": "OTHER-999",
            "transportAssignments.0.registrationKey": "OTHER999",
        } });
        const resolvedResponse = await request(staff, draftPath);
        assert.equal(resolvedResponse.status, 200, await resolvedResponse.clone().text());
        assert.match((await resolvedResponse.json()).message, /arrival transfer for flight UL505 is confirmed/);
        const pickupResolvedResponse = await request(staff, guestTransferPath);
        assert.equal(pickupResolvedResponse.status, 200, await pickupResolvedResponse.clone().text());
        const pickupResolved = await pickupResolvedResponse.json();
        assert.match(pickupResolved.message, /Vehicle: Private van - CI-ARR123/);
        assert.deepEqual(pickupResolved.reviewItems, []);
        const stalePackDownload = await fetch(packUrl, { method: "POST",
            headers: { Authorization: `Bearer ${jwt.sign({ id: staff._id, v: 0 }, process.env.JWT_SECRET)}`, "Content-Type": "application/json" },
            body: JSON.stringify({ reviewed: true, fingerprint: packClashing.fingerprint }),
        });
        assert.equal(stalePackDownload.status, 409);
        const packResolvedResponse = await fetch(`${packUrl}/preview`, {
            headers: { Authorization: `Bearer ${jwt.sign({ id: staff._id, v: 0 }, process.env.JWT_SECRET)}` },
        });
        assert.equal(packResolvedResponse.status, 200, await packResolvedResponse.clone().text());
        const packResolved = await packResolvedResponse.json();
        assert.match(JSON.stringify(packResolved.pack), /CI Chauffeur|CI-ARR123/);
        assert.equal(packResolved.delivery.current, false);
        assert.equal(packResolved.delivery.revision, 1);
        assert.equal((await packRequest(staff, deliveryPath, "PATCH", { ...packSent, expectedRevision: 1 })).status, 409);
        const markedNewPack = await packRequest(staff, deliveryPath, "PATCH", {
            ...packSent, expectedRevision: 1, fingerprint: packResolved.fingerprint,
        });
        assert.equal(markedNewPack.status, 200, await markedNewPack.clone().text());
        assert.equal((await markedNewPack.json()).delivery.current, true);
        const clearedPack = await packRequest(staff, deliveryPath, "PATCH", {
            action: "clear", expectedRevision: 2, reason: "Guest did not receive the PDF",
        });
        assert.equal(clearedPack.status, 200, await clearedPack.clone().text());
        assert.equal((await clearedPack.json()).delivery.revision, 3);
        assert.equal((await Booking.findById(booking._id)).travelPackDelivery, null);
        const packLogs = await ActivityLog.find({ relatedRecordId: booking._id, description: /Guest travel pack sent record/ }).sort({ createdAt: 1 });
        assert.equal(packLogs.length, 3);
        assert.equal(packLogs[2].metadata.reason, "Guest did not receive the PDF");
        assert.equal(JSON.stringify(packLogs).includes("private-arrival@example.invalid"), false);
        console.log("Pre-arrival contact and vehicle conflict guest draft and travel pack checks passed.");
    } finally {
        if (otherBooking) await Booking.deleteOne({ _id: otherBooking._id });
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
