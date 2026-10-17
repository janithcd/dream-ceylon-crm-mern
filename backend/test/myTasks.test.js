const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { buildMyTasksPipeline } = require("../utils/myTasks");

test("assigned task filters use Colombo dates and keep the owner scope after unwind", () => {
    const adminId = "507f1f77bcf86cd799439012";
    const now = new Date("2026-10-16T19:00:00Z");
    const pipeline = buildMyTasksPipeline(adminId, { dateFilter: "overdue" }, now);
    assert.deepEqual(pipeline[0].$match.bookingStatus.$in, ["Pending", "Confirmed", "In Progress"]);
    assert.equal(pipeline[0].$match["preparationTasks.assignedTo"], adminId);
    assert.equal(pipeline[2].$match["preparationTasks.assignedTo"], adminId);
    assert.equal(pipeline[4].$facet.items[0].$match.dueDate.$lt.toISOString(), "2026-10-16T18:30:00.000Z");
    assert.equal(pipeline[4].$facet.items[0].$match.completedAt, null);

    const today = buildMyTasksPipeline(adminId, { dateFilter: "today" }, now);
    assert.equal(today[4].$facet.items[0].$match.dueDate.$gte.toISOString(), "2026-10-16T18:30:00.000Z");
    assert.equal(today[4].$facet.items[0].$match.dueDate.$lte.toISOString(), "2026-10-17T18:29:59.999Z");

    const completed = buildMyTasksPipeline(adminId, { status: "completed", page: 2 }, now);
    assert.deepEqual(completed[4].$facet.items[0].$match.completedAt, { $ne: null });
    assert.equal(completed[4].$facet.items[3].$skip, 20);
});

test("my tasks API validates filters and returns only the signed-in owner's data", async (t) => {
    process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
    process.env.AUTH_RATE_LIMIT_MAX = "1000";
    const app = require("../app");
    const Admin = require("../models/Admin");
    const Booking = require("../models/Booking");
    const salesId = "507f1f77bcf86cd799439012";
    const viewerId = "507f1f77bcf86cd799439013";
    let usedPipeline;

    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({
        _id: id, role: String(id) === viewerId ? "Viewer" : "Sales", status: "Active", tokenVersion: 0,
    }) }));
    t.mock.method(Booking, "aggregate", async (pipeline) => {
        usedPipeline = pipeline;
        return [{
            summary: [{ open: 1, completed: 0, overdue: 1, today: 0, upcoming: 0, noDue: 0 }],
            total: [{ value: 1 }], items: [{ _id: "task-1", bookingCode: "DCJ-TEST-101", title: "Confirm hotel" }],
        }];
    });

    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}/api/bookings/my-tasks`;
    const request = (id, query = "") => fetch(`${url}${query}`, {
        headers: { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` },
    });

    assert.equal((await fetch(url)).status, 401);
    assert.equal((await request(salesId, "?status=other")).status, 400);
    assert.equal((await request(salesId, "?dateFilter=wrong")).status, 400);
    assert.equal((await request(salesId, "?status=completed&dateFilter=overdue")).status, 400);
    assert.equal((await request(salesId, "?page=0")).status, 400);
    assert.equal((await request(salesId, "?page=1.5")).status, 400);

    const response = await request(salesId, "?dateFilter=overdue");
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.items[0].bookingCode, "DCJ-TEST-101");
    assert.equal(body.summary.overdue, 1);
    assert.equal(String(usedPipeline[0].$match["preparationTasks.assignedTo"]), salesId);
    assert.equal(String(usedPipeline[2].$match["preparationTasks.assignedTo"]), salesId);

    assert.equal((await request(viewerId)).status, 200);
    assert.equal(String(usedPipeline[0].$match["preparationTasks.assignedTo"]), viewerId);
});
