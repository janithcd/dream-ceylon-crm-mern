const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
const app = require("../app");
const Admin = require("../models/Admin");
const Supplier = require("../models/Supplier");
const SupplierRate = require("../models/SupplierRate");
const Quotation = require("../models/Quotation");
const CostEntry = require("../models/CostEntry");
const ActivityLog = require("../models/ActivityLog");
const { parseRateSelection, buildRateEstimate } = require("../utils/rateEstimate");

const ids = { quotation: "507f1f77bcf86cd7994390a1", supplier: "507f1f77bcf86cd7994390a2",
    rate: "507f1f77bcf86cd7994390a3", finance: "507f1f77bcf86cd7994390a4",
    viewer: "507f1f77bcf86cd7994390a5", cost: "507f1f77bcf86cd7994390a6" };
const details = () => ({ supplierId: ids.supplier, rateId: ids.rate, expectedVersion: 0,
    serviceFrom: "2027-03-10", serviceTo: "2027-03-12", quantity: 6, conversionRate: 0.003 });

test("rate application checks units, whole service range and converts a server-calculated total", () => {
    assert.ok(parseRateSelection({ ...details(), quantity: "2.5" }).error);
    assert.ok(parseRateSelection({ ...details(), quantity: 0 }).error);
    assert.ok(parseRateSelection({ ...details(), serviceTo: "2027-03-09" }).error);
    assert.ok(parseRateSelection({ ...details(), serviceTo: "2027-02-30" }).error);
    assert.ok(parseRateSelection({ ...details(), expectedVersion: "0" }).error);
    const supplier = { _id: ids.supplier, category: "Hotel", status: "Active", name: "Beach House" };
    const rate = { _id: ids.rate, supplier: ids.supplier, status: "Active", service: "Superior sea view",
        unit: "Room per night", mealPlan: "Bed & Breakfast", occupancy: 2, amount: 16000,
        currency: "LKR", revision: 2, sourceReference: "Email quote 2027", validFrom: new Date("2027-03-01"), validTo: new Date("2027-03-31") };
    const quotation = { currency: "USD", travelStartDate: new Date("2027-03-10"), travelEndDate: new Date("2027-03-13") };
    const selected = parseRateSelection(details()).value;
    const result = buildRateEstimate(selected, supplier, rate, quotation, 0.003).value;
    assert.equal(result.amount, 96000);
    assert.equal(result.conversionRate, 0.003);
    assert.equal(result.rateSource.quantity, 6);
    assert.equal(result.rateSource.rateRevision, 2);
    assert.equal(result.rateSource.rateAmount, 16000);
    assert.match(result.description, /Beach House/);
    assert.match(buildRateEstimate(selected, supplier, rate, quotation).error, /exchange rate/);
    assert.match(buildRateEstimate(selected, supplier, rate, { ...quotation, travelEndDate: new Date("2027-03-11") }, 0.003).error, /quotation/);
    assert.match(buildRateEstimate(selected, supplier, { ...rate, validTo: new Date("2027-03-11") }, quotation, 0.003).error, /cover/);
});

test("rate estimate API enforces permissions, current revision and private snapshot", async (t) => {
    const supplier = { _id: ids.supplier, category: "Hotel", status: "Active", name: "Beach House" };
    const rate = new SupplierRate({ _id: ids.rate, __v: 0, supplier: ids.supplier, status: "Active",
        service: "Superior sea view", serviceKey: "superior sea view", unit: "Room per night",
        mealPlan: "Bed & Breakfast", occupancy: 2, amount: 16000, currency: "LKR",
        revision: 1, sourceReference: "Email quote 2027", validFrom: new Date("2027-03-01"), validTo: new Date("2027-03-31"),
        createdBy: ids.finance, updatedBy: ids.finance });
    const saved = [];
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({ _id: id,
        role: String(id) === ids.finance ? "Finance" : "Viewer", status: "Active", tokenVersion: 0 }) }));
    t.mock.method(Quotation, "findById", (id) => ({ select: async () => String(id) === ids.quotation ? {
        _id: ids.quotation, quotationNo: "DCJ-Q-RATE", clientName: "Test Client", tourTitle: "Test",
        currency: "USD", totals: { grandTotal: 1200 },
        travelStartDate: new Date("2027-03-10"), travelEndDate: new Date("2027-03-13"),
    } : null }));
    t.mock.method(Supplier, "findById", (id) => ({ select: async () => String(id) === ids.supplier ? supplier : null }));
    t.mock.method(SupplierRate, "findOne", async (query) =>
        String(query._id) === ids.rate && query.__v === rate.__v ? rate : null);
    t.mock.method(CostEntry, "create", async (value) => {
        const item = new CostEntry({ _id: ids.cost, ...value });
        await item.validate();
        saved.push(item);
        return item;
    });
    t.mock.method(CostEntry, "findById", async () => saved[0] || null);
    t.mock.method(ActivityLog, "create", async () => ({}));
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}/api/finance/costs`;
    const request = (url, id = ids.finance, body = details()) => fetch(base + url, {
        method: "POST", headers: { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const path = `/quotation/${ids.quotation}/from-rate`;
    assert.equal((await request(path, ids.viewer)).status, 403);
    assert.equal((await request(path, ids.finance, { ...details(), expectedVersion: 8 })).status, 409);
    assert.equal((await request(path, ids.finance, { ...details(), serviceTo: "2027-04-01" })).status, 400);
    assert.equal((await request(path, ids.finance, { ...details(), conversionRate: "" })).status, 400);
    const created = await request(path, ids.finance, { ...details(), amount: 1, currency: "USD", category: "Other", createdBy: ids.viewer });
    assert.equal(created.status, 201, await created.clone().text());
    const cost = await created.json();
    assert.equal(cost.amount, 96000);
    assert.equal(cost.currency, "LKR");
    assert.equal(cost.category, "Hotel");
    assert.equal(cost.rateSource.sourceReference, "Email quote 2027");
    assert.equal(saved.length, 1);

    // Normal cost edits keep the original source but mark it as an edited estimate.
    saved[0].save = async () => saved[0];
    const edited = await fetch(`${base}/${ids.cost}`, { method: "PUT", headers: {
        Authorization: `Bearer ${jwt.sign({ id: ids.finance }, process.env.JWT_SECRET)}`, "Content-Type": "application/json",
    }, body: JSON.stringify({ category: "Hotel", description: "Agreed revised price", amount: 90000,
        currency: "LKR", conversionRate: 0.003 }) });
    assert.equal(edited.status, 200, await edited.clone().text());
    assert.equal((await edited.json()).rateSource.manuallyEdited, true);
    assert.equal(saved[0].rateSource.rateAmount, 16000);
    rate.status = "Inactive";
    assert.equal((await request(path)).status, 400);
});
