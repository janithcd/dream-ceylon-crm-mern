const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
const app = require("../app");
const Admin = require("../models/Admin");
const Supplier = require("../models/Supplier");
const SupplierRate = require("../models/SupplierRate");
const ActivityLog = require("../models/ActivityLog");
const { parseSupplier, parseSupplierList } = require("../utils/supplierDirectory");

const ids = { finance: "507f1f77bcf86cd799439081", viewer: "507f1f77bcf86cd799439082",
    supplier: "507f1f77bcf86cd799439083" };
const details = () => ({ category: "Hotel", name: " Laluna Resort ", location: " Bentota ",
    contactName: "Accounts", email: "ACCOUNTS@example.com", phone: "+94 77 123 4567", whatsapp: "",
    terms: "Pro forma first\n50% advance", notes: "Internal note", status: "Active" });

test("supplier details validate categories, contacts, duplicates keys and multiline internal terms", () => {
    const parsed = parseSupplier(details()).value;
    assert.equal(parsed.nameKey, "laluna resort");
    assert.equal(parsed.locationKey, "bentota");
    assert.equal(parsed.email, "accounts@example.com");
    assert.match(parsed.terms, /\n/);
    for (const change of [{ category: "Unknown" }, { name: " " }, { email: "a@example.com,b@example.com" },
        { phone: "javascript:alert(1)" }, { status: "Deleted" }, { notes: "x".repeat(1001) },
        { contactName: "Name\nBcc: x" }]) assert.ok(parseSupplier({ ...details(), ...change }).error);
    assert.match(parseSupplierList({ page: 0 }).error, /page/);
    assert.match(parseSupplierList({ limit: 100000 }).error, /page/);
    assert.deepEqual(parseSupplierList({ keyword: "Laluna.*", status: "Active", category: "Hotel" }).value.query.$or[0],
        { name: { $regex: "Laluna\\.\\*", $options: "i" } });
});

test("supplier API permits scoped edits and rejects stale versions and untrusted fields", async (t) => {
    let stored = null;
    const logs = [];
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({ _id: id, name: "Finance",
        role: String(id) === ids.finance ? "Finance" : "Viewer", status: "Active", tokenVersion: 0 }) }));
    t.mock.method(Supplier, "create", async (value) => {
        const doc = new Supplier({ _id: ids.supplier, __v: 0, ...value });
        await doc.validate(); stored = doc.toObject(); return doc;
    });
    t.mock.method(Supplier, "findById", async (id) => {
        if (String(id) !== ids.supplier || !stored) return null;
        const doc = Supplier.hydrate(stored);
        doc.save = async () => { await doc.validate(); doc.__v += 1; stored = doc.toObject(); return doc; };
        return doc;
    });
    t.mock.method(ActivityLog, "create", async (entry) => { logs.push(entry); return entry; });
    t.mock.method(SupplierRate, "exists", async () => ({ _id: "rate" }));
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}/api/suppliers`;
    const request = (path, method, body, id = ids.finance) => fetch(`${url}${path}`, {
        method, headers: { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.equal((await request("", "POST", details(), ids.viewer)).status, 403);
    assert.equal((await request("", "POST", { ...details(), email: "bad" })).status, 400);
    const created = await request("", "POST", { ...details(), createdBy: ids.viewer, nameKey: "malicious" });
    assert.equal(created.status, 201, await created.clone().text());
    const publicData = await created.json();
    assert.equal(publicData.name, "Laluna Resort");
    assert.equal(publicData.nameKey, undefined);
    assert.equal(String(stored.createdBy), ids.finance);
    assert.equal(stored.nameKey, "laluna resort");
    assert.equal((await request(`/${ids.supplier}`, "PUT", { ...details(), expectedVersion: 0 }, ids.viewer)).status, 403);
    assert.equal((await request(`/${ids.supplier}`, "PUT", { ...details(), expectedVersion: 5 })).status, 409);
    assert.equal((await request(`/${ids.supplier}`, "PUT", { ...details(), category: "Guide", expectedVersion: 0 })).status, 409);
    const updated = await request(`/${ids.supplier}`, "PUT", { ...details(), name: "Laluna Ayurveda", status: "Inactive", expectedVersion: 0 });
    assert.equal(updated.status, 200, await updated.clone().text());
    assert.equal((await updated.json()).status, "Inactive");
    assert.equal(stored.nameKey, "laluna ayurveda");
    assert.equal((await request(`/${ids.supplier}`, "PUT", { ...details(), expectedVersion: 0 })).status, 409);
    assert.equal(logs.length, 2);
    assert.doesNotMatch(JSON.stringify(logs), /Pro forma|Internal note|ACCOUNTS@example/);
});
