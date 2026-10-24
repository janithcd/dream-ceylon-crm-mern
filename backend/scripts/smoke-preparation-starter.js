const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const ActivityLog = require("../models/ActivityLog");

const main = async () => {
    if (process.env.CI_SMOKE_TESTS !== "true") throw new Error("Explicit CI smoke opt-in required");
    await mongoose.connect(process.env.MONGO_URI);
    let admin;
    let booking;
    try {
        const dayMs = 24 * 60 * 60 * 1000;
        const dateOnly = (date) => {
            const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
                timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit",
            }).formatToParts(date).map(({ type, value }) => [type, value]));
            return `${parts.year}-${parts.month}-${parts.day}`;
        };
        admin = await Admin.create({
            name: "CI Starter Checklist", email: `ci-starter-${Date.now()}@example.invalid`,
            password: "disposable-ci-only-password", role: "Sales",
        });
        const departureDate = dateOnly(new Date(Date.now() + 5 * dayMs));
        booking = await Booking.create({
            customer: { fullName: "CI Starter Guest", email: "guest@example.invalid", whatsappNumber: "+94771234567", country: "UK" },
            travelStartDate: new Date(departureDate),
            travelEndDate: new Date(dateOnly(new Date(Date.now() + 10 * dayMs))),
            numberOfTravelers: 2, totalPrice: 1000,
        });
        const token = jwt.sign({ id: admin._id, v: 0 }, process.env.JWT_SECRET);
        const url = `http://127.0.0.1:5000/api/bookings/${booking._id}/preparation-starter`;
        const request = (method, body) => fetch(url, {
            method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const payload = (keys, includeDueDates = true) => ({ keys, includeDueDates, departureDate });
        const previewResponse = await request("GET");
        assert.equal(previewResponse.status, 200, `Preview: ${await previewResponse.clone().text()}`);
        const preview = await previewResponse.json();
        assert.equal(preview.options.length, 4);
        assert.equal(preview.options.find((item) => item.key === "accommodation").dueDate, dateOnly(new Date()));
        assert.equal((await request("POST", { ...payload(["accommodation"]), departureDate: "2020-01-01" })).status, 409);

        const results = await Promise.all([
            request("POST", payload(["accommodation"])),
            request("POST", payload(["accommodation"])),
        ]);
        assert.deepEqual(results.map((result) => result.status).sort(), [201, 409], "Concurrent imports cannot duplicate tasks");
        const updated = await Booking.findById(booking._id);
        assert.equal(updated.preparationTasks.length, 1);
        assert.equal(updated.preparationTasks[0].dueDate.toISOString().slice(0, 10), dateOnly(new Date()));
        const undated = await request("POST", payload(["transport", "itinerary"], false));
        assert.equal(undated.status, 201, `Add undated tasks: ${await undated.clone().text()}`);
        assert.equal((await Booking.findById(booking._id)).preparationTasks.filter((task) => task.dueDate).length, 1);
        await Booking.updateOne({ _id: booking._id }, { $push: { preparationTasks: { title: "confirm GUIDE" } } });
        assert.equal((await request("POST", payload(["guide"]))).status, 409, "Manual title is recognized");
        assert.ok(await ActivityLog.exists({ relatedRecordId: booking._id, description: /Starter checklist added/ }));
        console.log("Preparation starter smoke passed");
    } finally {
        if (booking) {
            await ActivityLog.deleteMany({ relatedRecordId: booking._id });
            await Booking.deleteOne({ _id: booking._id });
        }
        if (admin) await Admin.deleteOne({ _id: admin._id });
        await mongoose.disconnect();
    }
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
