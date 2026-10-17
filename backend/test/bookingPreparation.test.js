const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
process.env.AUTH_RATE_LIMIT_MAX = "1000";

const app = require("../app");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const ActivityLog = require("../models/ActivityLog");

test("booking preparation tasks use booking permissions and can be completed or reopened", async (t) => {
    const bookingId = "507f1f77bcf86cd799439011";
    const salesId = "507f1f77bcf86cd799439012";
    const viewerId = "507f1f77bcf86cd799439013";
    const inactiveId = "507f1f77bcf86cd799439014";
    const booking = new Booking({
        _id: bookingId,
        bookingCode: "DCJ-TEST-101",
        customer: { fullName: "Test Guest", email: "guest@example.test", whatsappNumber: "+94771234567", country: "UK" },
        travelStartDate: new Date("2027-03-01"),
        travelEndDate: new Date("2027-03-10"),
        numberOfTravelers: 2,
        totalPrice: 1000,
    });
    t.mock.method(booking, "populate", async () => booking);

    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({
        _id: id,
        role: String(id) === viewerId ? "Viewer" : "Sales",
        status: String(id) === inactiveId ? "Inactive" : "Active",
        tokenVersion: 0,
    }) }));
    t.mock.method(Admin, "find", () => ({
        select: () => ({ sort: () => ({ lean: async () => [
            { _id: salesId, name: "Sales Agent", role: "Sales" },
            { _id: viewerId, name: "Viewer", role: "Viewer" },
        ] }) }),
    }));
    t.mock.method(ActivityLog, "create", async () => ({}));
    t.mock.method(Booking, "exists", async () => ({ _id: bookingId }));
    t.mock.method(Booking, "findOneAndUpdate", async (query, update) => {
        if (String(query._id) !== bookingId) return null;
        if (update.$push) {
            if (booking.preparationTasks.length >= 30) return null;
            booking.preparationTasks.push(update.$push.preparationTasks);
        } else {
            const task = booking.preparationTasks.id(query["preparationTasks._id"]);
            if (!task) return null;
            if (update.$set) {
                for (const [key, value] of Object.entries(update.$set)) {
                    task[key.split(".")[2]] = value;
                }
            } else if (update.$pull) {
                task.deleteOne();
            }
        }
        return booking;
    });

    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}/api/bookings/${bookingId}/preparation-tasks`;
    const headers = (id) => ({
        Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}`,
        "Content-Type": "application/json",
    });
    const request = (path, method, id, body) => fetch(path, {
        method,
        headers: headers(id),
        body: body === undefined ? undefined : JSON.stringify(body),
    });

    const assigneesUrl = `http://127.0.0.1:${server.address().port}/api/bookings/preparation-assignees`;
    assert.equal((await request(assigneesUrl, "GET", viewerId)).status, 403);
    assert.deepEqual((await (await request(assigneesUrl, "GET", salesId)).json()).admins, [
        { _id: salesId, name: "Sales Agent", role: "Sales" },
    ]);

    assert.equal((await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: '{}' })).status, 401);
    assert.equal((await request(url, "POST", viewerId, { title: "Confirm hotel" })).status, 403);
    assert.equal((await request(url, "POST", salesId, { title: "  " })).status, 400);
    assert.equal((await request(url, "POST", salesId, { title: "x".repeat(121) })).status, 400);
    assert.equal((await request(url, "POST", salesId, { title: "Task", dueDate: "2027-02-30" })).status, 400);
    assert.equal((await request(url, "POST", salesId, { title: "Task", priority: "Critical" })).status, 400);
    assert.equal((await request(url, "POST", salesId, { title: "Task", priority: null })).status, 400);
    assert.equal((await request(url, "POST", salesId, { title: "Task", assignedTo: viewerId })).status, 400);
    assert.equal((await request(url, "POST", salesId, { title: "Task", assignedTo: inactiveId })).status, 400);

    const created = await request(url, "POST", salesId, {
        title: "  Confirm hotel  ", assignedTo: salesId, dueDate: "2027-02-28", priority: "High",
    });
    assert.equal(created.status, 201);
    const task = (await created.json()).tasks[0];
    assert.equal(task.title, "Confirm hotel");
    assert.equal(task.completedAt, null);
    assert.equal(String(task.assignedTo), salesId);
    assert.equal(task.dueDate, "2027-02-28T00:00:00.000Z");
    assert.equal(task.priority, "High");

    const taskUrl = `${url}/${task._id}`;
    assert.equal((await request(taskUrl, "PUT", viewerId, { dueDate: null })).status, 403);
    assert.equal((await request(taskUrl, "PUT", salesId, {})).status, 400);
    assert.equal((await request(taskUrl, "PUT", salesId, { dueDate: "not-a-date" })).status, 400);
    assert.equal((await request(taskUrl, "PUT", salesId, { assignedTo: "bad" })).status, 400);
    assert.equal((await request(taskUrl, "PUT", salesId, { priority: "Urgent" })).status, 400);
    assert.equal((await request(taskUrl, "PUT", salesId, { priority: null })).status, 400);
    assert.equal((await request(taskUrl, "PUT", salesId, { priority: "Low" })).status, 200);
    assert.equal(booking.preparationTasks[0].priority, "Low");
    const edited = await request(taskUrl, "PUT", salesId, { assignedTo: null, dueDate: "2027-03-01" });
    assert.equal(edited.status, 200);
    assert.equal((await edited.json()).tasks[0].dueDate, "2027-03-01T00:00:00.000Z");
    assert.equal(booking.preparationTasks[0].assignedTo, null);
    assert.equal((await request(taskUrl, "PUT", salesId, { dueDate: null })).status, 200);
    assert.equal(booking.preparationTasks[0].dueDate, null);
    assert.equal((await request(taskUrl, "PATCH", salesId, { completed: "yes" })).status, 400);
    const completed = await request(taskUrl, "PATCH", salesId, { completed: true });
    assert.equal(completed.status, 200);
    assert.ok((await completed.json()).tasks[0].completedAt);
    const reopened = await request(taskUrl, "PATCH", salesId, { completed: false });
    assert.equal(reopened.status, 200);
    assert.equal((await reopened.json()).tasks[0].completedAt, null);

    assert.equal((await request(taskUrl, "DELETE", viewerId)).status, 403);
    assert.equal((await request(taskUrl, "DELETE", salesId)).status, 200);
    assert.equal(booking.preparationTasks.length, 0);
    assert.equal((await request(taskUrl, "DELETE", salesId)).status, 404);

    for (let index = 0; index < 30; index += 1) booking.preparationTasks.push({ title: `Task ${index}` });
    assert.equal((await request(url, "POST", salesId, { title: "One too many" })).status, 409);
});

test("booking preparation task titles obey schema length limits", async () => {
    const booking = new Booking({
        customer: { fullName: "Test", email: "test@example.test", whatsappNumber: "+94771234567", country: "UK" },
        travelStartDate: new Date("2027-03-01"),
        travelEndDate: new Date("2027-03-10"),
        numberOfTravelers: 2,
        totalPrice: 1000,
        preparationTasks: [{ title: "Confirm hotel" }],
    });
    await booking.validate();
    assert.equal(booking.preparationTasks.length, 1);
    assert.equal(booking.preparationTasks[0].priority, "Normal");
    booking.preparationTasks[0].priority = "Critical";
    await assert.rejects(booking.validate(), /preparationTasks\.0\.priority/);
    booking.preparationTasks[0].priority = "Normal";
    booking.preparationTasks[0].title = "x".repeat(121);
    await assert.rejects(booking.validate(), /preparationTasks\.0\.title/);
});
