const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { buildTeamTasksPipeline } = require("../utils/teamTasks");

test("team queue selects open tasks from active bookings with Colombo date filters", () => {
    const now = new Date("2026-10-16T19:00:00Z");
    const pipeline = buildTeamTasksPipeline({ assignment: "unassigned", dateFilter: "overdue", priorityFilter: "high" }, now);

    assert.deepEqual(pipeline[0].$match.bookingStatus.$in, ["Pending", "Confirmed", "In Progress"]);
    assert.deepEqual(pipeline[0].$match.preparationTasks, { $elemMatch: { completedAt: null } });
    assert.equal(pipeline[2].$match["preparationTasks.completedAt"], null);
    const filters = pipeline[4].$facet.items[0].$match;
    assert.equal(filters.assignedTo, null);
    assert.equal(filters.priority, "High");
    assert.equal(filters.dueDate.$lt.toISOString(), "2026-10-16T18:30:00.000Z");
    assert.deepEqual(pipeline[3].$project.priority, { $ifNull: ["$preparationTasks.priority", "Normal"] });
    assert.deepEqual(pipeline[3].$project.notes, { $ifNull: ["$preparationTasks.notes", ""] });
    assert.equal(pipeline[4].$facet.items[2].$sort.priorityRank, 1);
    assert.deepEqual(pipeline[4].$facet.items[5].$lookup.pipeline[0].$project, { name: 1, role: 1, status: 1 });

    const today = buildTeamTasksPipeline({ assignment: "assigned", dateFilter: "today", page: 2 }, now);
    assert.deepEqual(today[4].$facet.items[0].$match.assignedTo, { $ne: null });
    assert.equal(today[4].$facet.items[0].$match.dueDate.$gte.toISOString(), "2026-10-16T18:30:00.000Z");
    assert.equal(today[4].$facet.items[0].$match.dueDate.$lte.toISOString(), "2026-10-17T18:29:59.999Z");
    assert.equal(today[4].$facet.items[3].$skip, 20);
});

test("team task API validates filters and grants booking viewers read access", async (t) => {
    process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
    process.env.AUTH_RATE_LIMIT_MAX = "1000";
    const app = require("../app");
    const Admin = require("../models/Admin");
    const Booking = require("../models/Booking");
    const viewerId = "507f1f77bcf86cd799439013";
    let usedPipeline;

    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({
        _id: id, role: "Viewer", status: "Active", tokenVersion: 0,
    }) }));
    t.mock.method(Booking, "aggregate", async (pipeline) => {
        usedPipeline = pipeline;
        return [{
            summary: [{ open: 2, unassigned: 1, assigned: 1, high: 1, overdue: 1, today: 0, upcoming: 0, noDue: 1 }],
            total: [{ value: 1 }],
            items: [{ _id: "task-1", bookingCode: "DCJ-TEST-101", title: "Confirm hotel", assignedTo: null }],
        }];
    });

    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}/api/bookings/team-tasks`;
    const request = (query = "") => fetch(`${url}${query}`, {
        headers: { Authorization: `Bearer ${jwt.sign({ id: viewerId }, process.env.JWT_SECRET)}` },
    });

    assert.equal((await fetch(url)).status, 401);
    assert.equal((await request("?assignment=wrong")).status, 400);
    assert.equal((await request("?dateFilter=wrong")).status, 400);
    assert.equal((await request("?priorityFilter=urgent")).status, 400);
    assert.equal((await request("?page=0")).status, 400);
    assert.equal((await request("?page=1.2")).status, 400);

    const response = await request("?assignment=unassigned&dateFilter=overdue&priorityFilter=high");
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.summary.unassigned, 1);
    assert.equal(body.items[0].bookingCode, "DCJ-TEST-101");
    assert.equal(body.totalPages, 1);
    assert.equal(usedPipeline[4].$facet.items[0].$match.priority, "High");
    assert.equal(usedPipeline[4].$facet.items[0].$match.assignedTo, null);
});
