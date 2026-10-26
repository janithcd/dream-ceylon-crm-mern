const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
const app = require("../app");
const Booking = require("../models/Booking");
const Admin = require("../models/Admin");
const { buildCancellationReviewPipeline } = require("../utils/cancellationReview");

test("cancellation queue filters individual open services and loads finance only after pagination", () => {
    const operations = buildCancellationReviewPipeline({ filter: "open", page: 2 });
    assert.deepEqual(operations[0], { $match: { bookingStatus: "Cancelled" } });
    assert.equal(operations[1].$project.currency, undefined);
    const stays = operations[1].$project.activeHotels.$map.input.$filter;
    assert.deepEqual(stays.cond.$in[1], ["Requested", "Confirmed"]);
    assert.deepEqual(operations.at(-1).$facet.items[0].$match, { activeServiceCount: { $gt: 0 } });
    assert.equal(operations.at(-1).$facet.items[2].$skip, 20);
    assert.equal(operations.at(-1).$facet.items.length, 4);

    const finance = buildCancellationReviewPipeline({ filter: "all", includeFinance: true });
    assert.equal(finance[1].$project.bookedPaidAmount, "$advancePayment");
    assert.equal(finance.at(-1).$facet.items[0].$match.activeServiceCount, undefined);
    assert.equal(finance.at(-1).$facet.items[4].$lookup.from, "costentries");
    assert.equal(finance.at(-1).$facet.items[5].$lookup.from, "bookingpayments");
});

test("cancellation review requires booking view and keeps finance totals restricted", async (t) => {
    const ids = {
        Sales: "507f1f77bcf86cd799439011", Finance: "507f1f77bcf86cd799439012",
        Manager: "507f1f77bcf86cd799439013", blocked: "507f1f77bcf86cd799439014",
    };
    const roles = new Map(Object.entries(ids).map(([role, id]) => [id, role === "blocked" ? "Unknown" : role]));
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({
        _id: id, role: roles.get(String(id)), status: "Active", tokenVersion: 0,
    }) }));
    const modes = [];
    t.mock.method(Booking, "aggregate", async (pipeline) => {
        const includeFinance = Boolean(pipeline[1].$project.currency);
        modes.push(includeFinance);
        return [{ summary: [{ total: 3, withActiveServices: 2 }], total: [{ value: 1 }],
            items: [{ bookingCode: "DCJ-1", ...(includeFinance ? { bookedPaidAmount: 20, guestLedger: [] } : {}) }] }];
    });
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}/api/bookings/cancellation-review`;
    const request = (query, role) => fetch(`${url}${query}`, { headers: role ? {
        Authorization: `Bearer ${jwt.sign({ id: ids[role] }, process.env.JWT_SECRET)}`,
    } : {} });

    assert.equal((await request("")).status, 401);
    assert.equal((await request("", "blocked")).status, 403);
    for (const query of ["?filter=other", "?page=0", "?page=2.5", "?page=1001"]) {
        assert.equal((await request(query, "Sales")).status, 400);
    }
    assert.deepEqual(modes, []);
    const sales = await request("?filter=open&page=1", "Sales");
    assert.equal(sales.status, 200);
    assert.equal(sales.headers.get("cache-control"), "no-store");
    const salesData = await sales.json();
    assert.deepEqual(salesData.summary, { total: 3, withActiveServices: 2 });
    assert.equal(salesData.items[0].bookedPaidAmount, undefined);
    assert.equal((await (await request("", "Manager")).json()).items[0].guestLedger, undefined);
    assert.equal((await (await request("?filter=all", "Finance")).json()).items[0].bookedPaidAmount, 20);
    assert.deepEqual(modes, [false, false, true]);
});
