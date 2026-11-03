const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
const app = require("../app");
const Admin = require("../models/Admin");
const Supplier = require("../models/Supplier");
const SupplierRate = require("../models/SupplierRate");
const ActivityLog = require("../models/ActivityLog");
const { parseSupplierRate, parseRateList } = require("../utils/supplierRates");

const ids = { finance: "507f1f77bcf86cd799439091", viewer: "507f1f77bcf86cd799439092",
    supplier: "507f1f77bcf86cd799439093", rate: "507f1f77bcf86cd799439094" };
const input = () => ({ service: " Superior sea view ", unit: "Room per night", mealPlan: "Bed & Breakfast",
    occupancy: 2, amount: 130, currency: "USD", validFrom: "2026-01-01", validTo: "2027-03-31",
    sourceReference: "Rate sheet email 2026-01-01", notes: "Taxes included", status: "Active" });

test("rate parser requires dated supplier offers, exact money and hotel occupancy", () => {
    const parsed = parseSupplierRate(input(), "Hotel").value;
    assert.equal(parsed.serviceKey, "superior sea view");
    assert.equal(parsed.occupancy, 2);
    assert.equal(parseSupplierRate({ ...input(), occupancy: "" }, "Hotel").error.includes("occupancy"), true);
    for (const change of [{ amount: 0.001 }, { amount: 0 }, { amount: "" }, { validFrom: "2026-02-30" },
        { validTo: "2025-12-31" }, { mealPlan: "BB" }, { currency: "AUD" },
        { sourceReference: "" }, { notes: "private\n\u202e" }]) assert.ok(parseSupplierRate({ ...input(), ...change }, "Hotel").error);
    const guide = parseSupplierRate({ ...input(), unit: "Day", mealPlan: "Bad", occupancy: 0 }, "Guide").value;
    assert.equal(guide.mealPlan, "");
    assert.equal(guide.occupancy, null);
});

test("rate date filters use Sri Lanka day and validate pagination", () => {
    const now = new Date("2026-11-03T19:30:00.000Z"); // Nov 4 in Sri Lanka.
    const current = parseRateList({ timing: "Current" }, now).value.filter;
    assert.equal(current.validFrom.$lte.toISOString().slice(0, 10), "2026-11-04");
    assert.equal(current.validTo.$gte.toISOString().slice(0, 10), "2026-11-04");
    assert.equal(parseRateList({ timing: "Upcoming" }, now).value.filter.validFrom.$gt.toISOString().slice(0, 10), "2026-11-04");
    assert.ok(parseRateList({ timing: "Invalid" }).error);
    assert.ok(parseRateList({ limit: 100 }).error);
});

test("rate API protects supplier scope, overlap, stale edits and previous prices", async (t) => {
    let stored = null;
    const logs = [];
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({ _id: id, name: "Finance",
        role: String(id) === ids.finance ? "Finance" : "Viewer", status: "Active", tokenVersion: 0 }) }));
    t.mock.method(Supplier, "findById", (id) => ({ select: async () => String(id) === ids.supplier ?
        { _id: ids.supplier, category: "Hotel", name: "Test Hotel", status: "Active" } : null }));
    t.mock.method(SupplierRate, "create", async (data) => {
        const rate = new SupplierRate({ _id: ids.rate, __v: 0, ...data });
        await rate.validate(); stored = rate.toObject(); return rate;
    });
    t.mock.method(SupplierRate, "findOne", async (query) => {
        if (!stored) return null;
        if (query._id && typeof query._id === "string") {
            if (query._id !== ids.rate || String(query.supplier) !== ids.supplier) return null;
            const doc = SupplierRate.hydrate(stored);
            doc.save = async () => { await doc.validate(); doc.__v += 1; stored = doc.toObject(); return doc; };
            return doc;
        }
        if (query._id?.$ne) return null;
        return stored.serviceKey === query.serviceKey && stored.status === "Active" &&
            stored.validFrom <= query.validFrom.$lte && stored.validTo >= query.validTo.$gte ? stored : null;
    });
    t.mock.method(ActivityLog, "create", async (value) => { logs.push(value); return value; });
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}/api/suppliers/${ids.supplier}/rates`;
    const request = (suffix, method, body, id = ids.finance) => fetch(base + suffix, {
        method, headers: { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.equal((await request("", "POST", input(), ids.viewer)).status, 403);
    assert.equal((await request("", "POST", { ...input(), validTo: "2025-01-01" })).status, 400);
    const created = await request("", "POST", { ...input(), supplier: ids.viewer, createdBy: ids.viewer });
    assert.equal(created.status, 201, await created.clone().text());
    assert.equal((await created.json()).serviceKey, undefined);
    assert.equal(String(stored.supplier), ids.supplier);
    assert.equal((await request("", "POST", { ...input(), validFrom: "2027-03-01" })).status, 409);
    assert.equal((await request(`/${ids.rate}`, "PUT", { ...input(), amount: 125, expectedVersion: 8 })).status, 409);
    assert.equal((await request(`/${ids.rate}`, "PUT", { ...input(), expectedVersion: 0 })).status, 400);
    const revised = await request(`/${ids.rate}`, "PUT", { ...input(), amount: 125, expectedVersion: 0 });
    assert.equal(revised.status, 200, await revised.clone().text());
    const latest = await revised.json();
    assert.equal(latest.amount, 125);
    assert.equal(latest.revision, 2);
    assert.equal(latest.history[0].amount, 130);
    assert.equal(latest.history[0].sourceReference, input().sourceReference);
    assert.equal((await request(`/${ids.rate}`, "PUT", { ...input(), amount: 120, expectedVersion: 0 })).status, 409);
    assert.equal(logs.length, 2);
    assert.doesNotMatch(JSON.stringify(logs), /125|130|Rate sheet email|Taxes included/);
});
