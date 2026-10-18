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
    let otherAdmin;
    let booking;

    try {
        const dayMs = 24 * 60 * 60 * 1000;
        const travelStart = new Date(Date.now() + 5 * dayMs);
        const travelEnd = new Date(Date.now() + 10 * dayMs);
        const hotelCheckout = new Date(Date.now() + 7 * dayMs);
        const dateOnly = (date) => {
            const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
                timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit",
            }).formatToParts(date).map(({ type, value }) => [type, value]));
            return `${parts.year}-${parts.month}-${parts.day}`;
        };

        admin = await Admin.create({
            name: "CI Booking Test",
            email: `ci-booking-${Date.now()}@example.invalid`,
            password: "disposable-ci-only-password",
            role: "Sales",
        });
        booking = await Booking.create({
            customer: { fullName: "CI Guest", email: "guest@example.invalid", whatsappNumber: "+94771234567", country: "UK" },
            travelStartDate: new Date(dateOnly(travelStart)),
            travelEndDate: new Date(dateOnly(travelEnd)),
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
        const getAttention = async () => {
            const response = await request("http://127.0.0.1:5000/api/dashboard/stats", "GET");
            const body = await response.json();
            assert.equal(response.status, 200, `Dashboard stats: ${JSON.stringify(body)}`);
            return body.bookingAttention;
        };
        const ownAttention = async () => (await getAttention()).items.find((item) => item.bookingCode === booking.bookingCode);
        const getMine = async (params = "", authToken = token) => {
            const response = await fetch(`http://127.0.0.1:5000/api/bookings/my-tasks${params}`, {
                headers: { Authorization: `Bearer ${authToken}` },
            });
            const body = await response.json();
            assert.equal(response.status, 200, `My tasks: ${JSON.stringify(body)}`);
            return body;
        };
        const getTeam = async (params = "") => {
            const response = await request(`http://127.0.0.1:5000/api/bookings/team-tasks${params}`, "GET");
            const body = await response.json();
            assert.equal(response.status, 200, `Team tasks: ${JSON.stringify(body)}`);
            return body;
        };

        const assignees = await request("http://127.0.0.1:5000/api/bookings/preparation-assignees", "GET");
        assert.equal(assignees.status, 200);
        assert.ok((await assignees.json()).admins.some((item) => item._id === String(admin._id)));

        const added = await request(url, "POST", {
            title: "Confirm hotel", assignedTo: String(admin._id),
            dueDate: dateOnly(new Date(Date.now() - dayMs)),
            priority: "High",
            notes: "  Check supplier room availability  ",
        });
        const addedBody = await added.text();
        assert.equal(added.status, 201, `Add task: ${addedBody}`);
        const tasks = (await Booking.findById(booking._id)).preparationTasks;
        assert.equal(tasks.length, 1);
        assert.equal(tasks[0].title, "Confirm hotel");
        assert.equal(String(tasks[0].assignedTo), String(admin._id));
        assert.equal(tasks[0].priority, "High");
        assert.equal(tasks[0].notes, "Check supplier room availability");
        const bookingView = await request(`http://127.0.0.1:5000/api/bookings/${booking._id}`, "GET");
        assert.equal(bookingView.status, 200);
        assert.equal((await bookingView.json()).preparationTasks[0].assignedTo.name, "CI Booking Test");
        assert.equal((await ownAttention()).openTaskCount, 1);
        assert.equal((await ownAttention()).overdueTaskCount, 1);
        const overdueMine = await getMine("?dateFilter=overdue");
        assert.equal(overdueMine.summary.overdue, 1);
        assert.equal(overdueMine.total, 1);
        assert.equal(overdueMine.items[0].bookingCode, booking.bookingCode);
        assert.equal(overdueMine.items[0].priority, "High");
        assert.equal(overdueMine.items[0].notes, "Check supplier room availability");
        assert.equal((await getMine("?priorityFilter=high")).total, 1);
        assert.equal((await getTeam()).summary.assigned, 1);
        assert.equal((await getTeam()).total, 0);

        const taskUrl = `${url}/${tasks[0]._id}`;
        const rescheduled = await request(taskUrl, "PUT", { dueDate: dateOnly(new Date(Date.now() + dayMs)), priority: "Low", notes: "Supplier confirmed" });
        assert.equal(rescheduled.status, 200);
        assert.equal(String((await Booking.findById(booking._id)).preparationTasks[0].assignedTo), String(admin._id));
        assert.equal((await Booking.findById(booking._id)).preparationTasks[0].priority, "Low");
        assert.equal((await Booking.findById(booking._id)).preparationTasks[0].notes, "Supplier confirmed");
        assert.equal((await getMine("?priorityFilter=high")).total, 0);
        assert.equal((await getMine()).items[0].priority, "Low");
        assert.equal((await ownAttention()).overdueTaskCount, 0);
        assert.equal((await getMine("?dateFilter=upcoming")).total, 1);

        const urgent = await request(url, "POST", {
            title: "Confirm guide", assignedTo: String(admin._id),
            dueDate: dateOnly(new Date(Date.now() + dayMs)), priority: "High",
        });
        assert.equal(urgent.status, 201);
        const urgentId = (await urgent.json()).tasks.find((task) => task.title === "Confirm guide")._id;
        assert.deepEqual((await getMine("?dateFilter=upcoming")).items.map((task) => task.priority), ["High", "Low"]);
        assert.equal((await getMine("?dateFilter=upcoming&priorityFilter=high")).total, 1);
        assert.equal((await request(`${url}/${urgentId}`, "DELETE")).status, 200);

        const completed = await request(taskUrl, "PATCH", { completed: true });
        assert.equal(completed.status, 200);
        assert.ok((await Booking.findById(booking._id)).preparationTasks[0].completedAt);
        assert.equal(String((await Booking.findById(booking._id)).preparationTasks[0].assignedTo), String(admin._id));
        assert.equal(await ownAttention(), undefined);
        assert.equal((await getMine()).total, 0);
        assert.equal((await getMine("?status=completed")).total, 1);

        const reopened = await request(taskUrl, "PATCH", { completed: false });
        assert.equal(reopened.status, 200);
        assert.equal((await Booking.findById(booking._id)).preparationTasks[0].completedAt, null);
        assert.equal((await ownAttention()).openTaskCount, 1);
        assert.equal((await getMine()).summary.open, 1);

        const unassigned = await request(taskUrl, "PUT", { assignedTo: null, dueDate: null });
        assert.equal(unassigned.status, 200);
        const unassignedTask = (await Booking.findById(booking._id)).preparationTasks[0];
        assert.equal(unassignedTask.assignedTo, null);
        assert.equal(unassignedTask.dueDate, null);
        const teamBeforeClaim = await getTeam("?dateFilter=noDue");
        assert.equal(teamBeforeClaim.total, 1);
        assert.equal(teamBeforeClaim.summary.unassigned, 1);
        assert.equal(teamBeforeClaim.items[0].notes, "Supplier confirmed");

        otherAdmin = await Admin.create({
            name: "CI Other Agent",
            email: `ci-other-${Date.now()}@example.invalid`,
            password: "disposable-ci-only-password",
            role: "Sales",
        });
        const otherToken = jwt.sign({ id: otherAdmin._id, v: 0 }, process.env.JWT_SECRET);
        const claimUrl = `${taskUrl}/claim`;
        const claims = await Promise.all([
            request(claimUrl, "PATCH"),
            fetch(claimUrl, { method: "PATCH", headers: { Authorization: `Bearer ${otherToken}` } }),
        ]);
        assert.deepEqual(claims.map((response) => response.status).sort(), [200, 409]);
        const claimedBy = String((await Booking.findById(booking._id)).preparationTasks[0].assignedTo);
        assert.ok([String(admin._id), String(otherAdmin._id)].includes(claimedBy));
        assert.equal((await getTeam()).summary.unassigned, 0);
        const assignedTeam = await getTeam("?assignment=assigned");
        assert.equal(assignedTeam.total, 1);
        assert.equal(assignedTeam.items[0].assignee.name, claimedBy === String(admin._id) ? "CI Booking Test" : "CI Other Agent");

        const removed = await request(taskUrl, "DELETE");
        assert.equal(removed.status, 200);
        assert.equal((await Booking.findById(booking._id)).preparationTasks.length, 0);
        assert.equal(await ownAttention(), undefined);

        const hotelsUrl = `http://127.0.0.1:5000/api/bookings/${booking._id}/hotel-stays`;
        const hotelAdded = await request(hotelsUrl, "POST", {
            hotelName: "CI Hotel",
            location: "Sigiriya",
            checkInDate: dateOnly(travelStart),
            checkOutDate: dateOnly(hotelCheckout),
            rooms: 1,
            mealPlan: "Half Board",
        });
        const hotelAddedBody = await hotelAdded.text();
        assert.equal(hotelAdded.status, 201, `Add hotel stay: ${hotelAddedBody}`);
        const hotel = (await Booking.findById(booking._id)).hotelStays[0];
        assert.equal(hotel.hotelName, "CI Hotel");
        assert.equal((await ownAttention()).pendingHotelCount, 1);

        const hotelUrl = `${hotelsUrl}/${hotel._id}`;
        const confirmed = await request(hotelUrl, "PUT", { status: "Confirmed", confirmationNumber: "CI-123" });
        const confirmedBody = await confirmed.text();
        assert.equal(confirmed.status, 200, `Confirm hotel stay: ${confirmedBody}`);
        assert.equal((await Booking.findById(booking._id)).hotelStays[0].confirmationNumber, "CI-123");
        assert.equal(await ownAttention(), undefined);

        const hotelRemoved = await request(hotelUrl, "DELETE");
        assert.equal(hotelRemoved.status, 200);
        assert.equal((await Booking.findById(booking._id)).hotelStays.length, 0);

        const otherTask = await request(url, "POST", { title: "Other agent only", assignedTo: String(otherAdmin._id) });
        assert.equal(otherTask.status, 201);
        const otherTaskId = (await otherTask.json()).tasks[0]._id;
        assert.equal((await getMine()).total, 0);
        assert.equal((await getMine("", otherToken)).items[0].title, "Other agent only");
        assert.equal((await getMine("", otherToken)).items[0].priority, "Normal");
        assert.equal((await request(`${url}/${otherTaskId}`, "DELETE")).status, 200);

        console.log("Booking preparation, hotel stays, dashboard attention, and assigned tasks smoke tests passed against MongoDB.");
    } finally {
        if (booking) {
            await ActivityLog.deleteMany({ relatedRecordId: booking._id });
            await Booking.deleteOne({ _id: booking._id });
        }
        if (admin) await Admin.deleteOne({ _id: admin._id });
        if (otherAdmin) await Admin.deleteOne({ _id: otherAdmin._id });
        await mongoose.disconnect();
    }
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
