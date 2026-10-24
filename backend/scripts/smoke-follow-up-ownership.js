const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const FollowUp = require("../models/FollowUp");
const ActivityLog = require("../models/ActivityLog");
const { getBusinessDayBounds } = require("../utils/businessDate");

const main = async () => {
    if (process.env.CI_SMOKE_TESTS !== "true") {
        throw new Error("This smoke test must be explicitly enabled in CI");
    }

    await mongoose.connect(process.env.MONGO_URI);
    const admins = [];
    const reminders = [];
    try {
        for (const role of ["Sales", "Sales", "Finance"]) {
            admins.push(await Admin.create({
                name: `CI Follow-Up ${role}`,
                email: `ci-follow-up-${role}-${Date.now()}-${admins.length}@example.invalid`,
                password: "disposable-ci-only-password",
                role,
            }));
        }
        const [sales, colleague, finance] = admins;
        const token = (admin) => jwt.sign({ id: admin._id, v: 0 }, process.env.JWT_SECRET);
        const base = "http://127.0.0.1:5000/api/follow-ups";
        const request = (path, method = "GET", body, admin = sales) => fetch(`${base}${path}`, {
            method,
            headers: { Authorization: `Bearer ${token(admin)}`, "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const { start, end } = getBusinessDayBounds();
        const reminder = { title: "CI follow-up", followUpDate: start.toISOString() };

        assert.equal((await request("/assignees", "GET", undefined, finance)).status, 403);
        const assignees = (await (await request("/assignees")).json()).admins;
        assert.ok(assignees.some((person) => person._id === String(colleague._id)));
        assert.ok(!assignees.some((person) => person._id === String(finance._id)));
        assert.equal((await request("", "POST", { ...reminder, assignedTo: String(finance._id) })).status, 400);

        const create = async (body) => {
            const response = await request("", "POST", body);
            assert.equal(response.status, 201, `Create follow-up: ${await response.clone().text()}`);
            const saved = (await response.json()).followUp;
            reminders.push(saved._id);
            return saved;
        };
        const mine = await create(reminder);
        assert.equal(mine.assignedTo._id, String(sales._id));
        const unassigned = await create({
            ...reminder, title: "Unassigned CI reminder", assignedTo: null,
            followUpDate: new Date(start.getTime() - 86400000).toISOString(),
        });
        assert.equal(unassigned.assignedTo, null);
        const theirs = await create({
            ...reminder, title: "Colleague CI reminder", assignedTo: String(colleague._id),
            followUpDate: new Date(end.getTime() + 86400000).toISOString(),
        });
        assert.equal(theirs.assignedTo.name, colleague.name);

        const mineDue = await (await request("?owner=mine&dateFilter=due")).json();
        assert.deepEqual(mineDue.followUps.map((item) => item._id), [mine._id]);
        const attention = await (await request("?owner=attention&dateFilter=due")).json();
        assert.deepEqual(attention.followUps.map((item) => item._id), [unassigned._id, mine._id]);
        assert.deepEqual(attention.followUps.map((item) => item.assignedTo?.name || "Unassigned"),
            ["Unassigned", sales.name]);
        const summary = await (await request("/summary?owner=attention")).json();
        assert.deepEqual([summary.pending, summary.overdue, summary.today, summary.upcoming], [2, 1, 1, 0]);
        assert.equal((await (await request("?owner=mine", "GET", undefined, colleague)).json()).totalFollowUps, 1);

        const update = await request(`/${unassigned._id}`, "PUT", { assignedTo: String(colleague._id) });
        assert.equal(update.status, 200, `Assign reminder: ${await update.clone().text()}`);
        assert.equal((await update.json()).followUp.assignedTo.name, colleague.name);
        assert.equal((await (await request("/summary?owner=unassigned")).json()).pending, 0);
        assert.equal((await (await request("?owner=mine&dateFilter=due", "GET", undefined, colleague)).json()).totalFollowUps, 1);
        console.log("Follow-up ownership, scoped due queue, and Colombo summary smoke tests passed against MongoDB.");
    } finally {
        if (reminders.length) {
            await ActivityLog.deleteMany({ relatedRecordId: { $in: reminders } });
            await FollowUp.deleteMany({ _id: { $in: reminders } });
        }
        if (admins.length) await Admin.deleteMany({ _id: { $in: admins.map((admin) => admin._id) } });
        await mongoose.disconnect();
    }
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
