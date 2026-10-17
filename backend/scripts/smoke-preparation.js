const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const ActivityLog = require("../models/ActivityLog");

const main = async () => {
    if (process.env.CI_SMOKE_TESTS !== "true") {
        throw new Error("This smoke test must be explicitly enabled in CI");
    }

    await mongoose.connect(process.env.MONGO_URI);
    let admin;
    let booking;

    try {
        admin = await Admin.create({
            name: "CI Booking Test",
            email: `ci-booking-${Date.now()}@example.invalid`,
            password: "disposable-ci-only-password",
            role: "Sales",
        });
        booking = await Booking.create({
            customer: { fullName: "CI Guest", email: "guest@example.invalid", whatsappNumber: "+94771234567", country: "UK" },
            travelStartDate: new Date("2027-03-01"),
            travelEndDate: new Date("2027-03-10"),
            numberOfTravelers: 2,
            totalPrice: 1000,
        });

        const token = jwt.sign({ id: admin._id, v: 0 }, process.env.JWT_SECRET);
        const url = `http://127.0.0.1:5000/api/bookings/${booking._id}/preparation-tasks`;
        const request = (path, method, body) => fetch(path, {
            method,
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
        });

        const added = await request(url, "POST", { title: "Confirm hotel" });
        const addedBody = await added.text();
        assert.equal(added.status, 201, `Add task: ${addedBody}`);
        const tasks = (await Booking.findById(booking._id)).preparationTasks;
        assert.equal(tasks.length, 1);
        assert.equal(tasks[0].title, "Confirm hotel");

        const taskUrl = `${url}/${tasks[0]._id}`;
        const completed = await request(taskUrl, "PATCH", { completed: true });
        assert.equal(completed.status, 200);
        assert.ok((await Booking.findById(booking._id)).preparationTasks[0].completedAt);

        const reopened = await request(taskUrl, "PATCH", { completed: false });
        assert.equal(reopened.status, 200);
        assert.equal((await Booking.findById(booking._id)).preparationTasks[0].completedAt, null);

        const removed = await request(taskUrl, "DELETE");
        assert.equal(removed.status, 200);
        assert.equal((await Booking.findById(booking._id)).preparationTasks.length, 0);
        console.log("Booking preparation smoke test passed against MongoDB.");
    } finally {
        if (booking) {
            await ActivityLog.deleteMany({ relatedRecordId: booking._id });
            await Booking.deleteOne({ _id: booking._id });
        }
        if (admin) await Admin.deleteOne({ _id: admin._id });
        await mongoose.disconnect();
    }
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
