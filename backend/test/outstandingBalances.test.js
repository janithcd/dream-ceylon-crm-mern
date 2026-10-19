const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";

const app = require("../app");
const Booking = require("../models/Booking");
const Admin = require("../models/Admin");
const { buildOutstandingBalancesPipeline } = require("../utils/outstandingBalances");

test("open balances use recorded amounts and Sri Lanka departure days without exposing contact details", () => {
    const now = new Date("2026-10-16T19:00:00Z");
    const pipeline = buildOutstandingBalancesPipeline({ dateFilter: "next30", page: 2 }, now);
    assert.deepEqual(pipeline[0].$match.bookingStatus.$in, ["Pending", "Confirmed", "In Progress", "Completed"]);
    assert.deepEqual(pipeline[1].$project.recordedPaid, { $ifNull: ["$advancePayment", 0] });
    assert.deepEqual(pipeline[1].$project.balance, {
        $round: [{ $subtract: ["$totalPrice", { $ifNull: ["$advancePayment", 0] }] }, 2],
    });
    assert.deepEqual(Object.keys(pipeline[1].$project).sort(), [
        "balance", "bookingCode", "bookingStatus", "currency", "customerName", "recordedPaid", "totalPrice", "travelEndDate", "travelStartDate",
    ].sort());
    assert.deepEqual(pipeline[2].$match, { balance: { $gt: 0 } });
    const selected = { travelStartDate: {
        $gte: new Date("2026-10-16T18:30:00Z"),
        $lt: new Date("2026-11-15T18:30:00Z"),
    } };
    assert.deepEqual(pipeline[3].$facet.items[0].$match, selected);
    assert.deepEqual(pipeline[3].$facet.total[0].$match, selected);
    assert.equal(pipeline[3].$facet.items.at(-2).$skip, 20);
    assert.deepEqual(buildOutstandingBalancesPipeline({ dateFilter: "departed" }, now)[3].$facet.items[0].$match, {
        travelStartDate: { $lt: selected.travelStartDate.$gte },
    });
    assert.deepEqual(buildOutstandingBalancesPipeline({ dateFilter: "later" }, now)[3].$facet.items[0].$match, {
        travelStartDate: { $gte: selected.travelStartDate.$lt },
    });
});

test("balance queue requires booking and payment view and validates filters", async (t) => {
    const financeId = "507f1f77bcf86cd799439081";
    const salesId = "507f1f77bcf86cd799439082";
    let aggregateCalls = 0;
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({
        _id: id, role: String(id) === salesId ? "Sales" : "Finance", status: "Active", tokenVersion: 0,
    }) }));
    t.mock.method(Booking, "aggregate", async () => {
        aggregateCalls += 1;
        return [{
            summary: [{ open: 2, departed: 1, next30: 1, later: 0 }],
            total: [{ value: 1 }],
            items: [{ bookingCode: "DCJ-1", totalPrice: 1000, recordedPaid: 400, balance: 600, currency: "USD" }],
        }];
    });

    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}/api/bookings/outstanding-balances`;
    const request = (query, id) => fetch(`${url}${query}`, {
        headers: id ? { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` } : {},
    });

    assert.equal((await request("")).status, 401);
    assert.equal((await request("", salesId)).status, 403);
    for (const query of ["?dateFilter=soon", "?page=0", "?page=1.5", "?page=10001"]) {
        assert.equal((await request(query, financeId)).status, 400);
    }
    assert.equal(aggregateCalls, 0);
    const response = await request("?dateFilter=departed&page=1", financeId);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.deepEqual(data.summary, { open: 2, departed: 1, next30: 1, later: 0 });
    assert.equal(data.total, 1);
    assert.equal(data.items[0].balance, 600);
    assert.equal(aggregateCalls, 1);
});
