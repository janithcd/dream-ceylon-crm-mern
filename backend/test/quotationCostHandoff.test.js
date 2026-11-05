const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
const app = require("../app");
const Admin = require("../models/Admin");
const Quotation = require("../models/Quotation");
const Booking = require("../models/Booking");
const CostEntry = require("../models/CostEntry");
const ActivityLog = require("../models/ActivityLog");

const ids = { booking: "507f1f77bcf86cd7994390b1", quotation: "507f1f77bcf86cd7994390b2",
    estimate: "507f1f77bcf86cd7994390b3", cost: "507f1f77bcf86cd7994390b4",
    finance: "507f1f77bcf86cd7994390b5", viewer: "507f1f77bcf86cd7994390b6" };
const requestBody = () => ({ category: "Hotel", description: "Confirmed beach house", amount: 130,
    currency: "USD", conversionRate: 1, paymentDueDate: "2027-03-01", paidAmount: 0,
    estimateId: ids.estimate, estimateVersion: 0, confirmedEstimate: true });

test("quotation estimate handoff requires review, linked identity and fresh version", async (t) => {
    const estimate = new CostEntry({ _id: ids.estimate, __v: 0, recordType: "Quotation", recordId: ids.quotation,
        category: "Hotel", description: "Beach House", amount: 120, currency: "USD", conversionRate: 1,
        targetCurrency: "USD", createdBy: ids.finance });
    let linked = true;
    let bookingCost = null;
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({ _id: id,
        role: String(id) === ids.finance ? "Finance" : "Viewer", status: "Active", tokenVersion: 0 }) }));
    t.mock.method(Booking, "findById", (id) => ({ select: async () => String(id) === ids.booking ? {
        _id: ids.booking, bookingCode: "DCJ-BOOK-CI", customer: { fullName: "Test Guest" },
        currency: "USD", totalPrice: 1000, bookingStatus: "Confirmed",
    } : null }));
    t.mock.method(Quotation, "findOne", () => ({ select: async () => linked ? {
        _id: ids.quotation, quotationNo: "DCJ-Q-CI", currency: "USD", totals: { grandTotal: 1000 },
    } : null }));
    t.mock.method(CostEntry, "findOne", async (query) => String(query._id) === ids.estimate &&
        String(query.recordId) === ids.quotation ? estimate : null);
    t.mock.method(CostEntry, "exists", async () => bookingCost ? { _id: ids.cost } : null);
    t.mock.method(CostEntry, "create", async (value) => {
        const cost = new CostEntry({ _id: ids.cost, ...value });
        await cost.validate(); bookingCost = cost; return cost;
    });
    t.mock.method(CostEntry, "find", (query) => ({
        sort() { return this; },
        lean: async () => query.recordType === "Quotation" ? [estimate.toObject()] : bookingCost ? [bookingCost.toObject()] : [],
    }));
    t.mock.method(CostEntry, "findById", async () => bookingCost);
    t.mock.method(ActivityLog, "create", async () => ({}));
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}/api/finance/costs/booking/${ids.booking}`;
    const auth = (id = ids.finance) => ({ Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}`, "Content-Type": "application/json" });
    const post = (body, id) => fetch(url, { method: "POST", headers: auth(id), body: JSON.stringify(body) });

    assert.equal((await post(requestBody(), ids.viewer)).status, 403);
    assert.equal((await post({ ...requestBody(), confirmedEstimate: false })).status, 400);
    assert.equal((await post({ ...requestBody(), paidAmount: 10 })).status, 400);
    assert.equal((await post({ ...requestBody(), estimateVersion: 5 })).status, 409);
    assert.equal((await post({ ...requestBody(), estimateId: ids.viewer })).status, 404);
    linked = false;
    assert.equal((await post(requestBody())).status, 409);
    linked = true;

    const created = await post({ ...requestBody(), estimateSource: { amount: 1 }, rateSource: { amount: 1 } });
    assert.equal(created.status, 201, await created.clone().text());
    const actual = await created.json();
    assert.equal(actual.estimateSource.amount, 120);
    assert.equal(actual.estimateSource.quotationNo, "DCJ-Q-CI");
    assert.equal(actual.estimateSource.manuallyEdited, true);
    assert.equal(actual.amount, 130);
    assert.equal(actual.paidAmount, 0);
    assert.equal(actual.paymentDueDate.slice(0, 10), "2027-03-01");
    assert.equal(actual.rateSource, null);
    assert.equal((await post(requestBody())).status, 409);

    const overview = await (await fetch(url, { headers: auth() })).json();
    assert.equal(overview.linkedEstimate.items[0].bookingCostId, ids.cost);
    bookingCost.save = async () => bookingCost;
    const edit = await fetch(`http://127.0.0.1:${server.address().port}/api/finance/costs/${ids.cost}`, {
        method: "PUT", headers: auth(), body: JSON.stringify({ category: "Hotel", description: "Confirmed beach house",
            amount: 135, currency: "USD", conversionRate: 1 }),
    });
    assert.equal(edit.status, 200, await edit.clone().text());
    assert.equal((await edit.json()).estimateSource.manuallyEdited, true);
    assert.equal(bookingCost.estimateSource.amount, 120);
});
