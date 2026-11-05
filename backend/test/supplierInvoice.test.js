const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
const app = require("../app");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const CostEntry = require("../models/CostEntry");
const Invoice = require("../models/SupplierInvoice");
const ActivityLog = require("../models/ActivityLog");
const { parseInvoiceDetails, parseInvoiceReview, parseInvoiceVoid } = require("../utils/supplierInvoice");

const ids = { booking: "507f1f77bcf86cd7994390c1", cost: "507f1f77bcf86cd7994390c2",
    invoice: "507f1f77bcf86cd7994390c3", finance: "507f1f77bcf86cd7994390c4", sales: "507f1f77bcf86cd7994390c5" };
const pdf = Buffer.from("%PDF-1.7\nSupplier pro forma invoice\n%%EOF\n");
const details = () => ({ supplierName: "Thaproban Beach House", invoiceReference: "THB27301",
    invoiceDate: "2026-10-16", dueDate: "2027-03-09", amount: 130, currency: "USD" });

test("supplier invoice metadata and review demand a dated, deliberate record", () => {
    assert.equal(parseInvoiceDetails(details()).value.referenceKey, "thb27301");
    for (const change of [{ supplierName: "" }, { invoiceReference: "x\nBcc: y" }, { invoiceDate: "2026-02-30" },
        { dueDate: "2026-10-15" }, { amount: 0.001 }, { amount: "" }, { currency: "AUD" }]) {
        assert.ok(parseInvoiceDetails({ ...details(), ...change }).error);
    }
    assert.equal(parseInvoiceDetails({ ...details(), dueDate: "" }).value.dueDate, null);
    assert.ok(parseInvoiceReview({ status: "Approved", expectedVersion: 0, confirmed: true }).value);
    assert.ok(parseInvoiceReview({ status: "Approved", expectedVersion: 0, confirmed: false }).error);
    assert.ok(parseInvoiceReview({ status: "Disputed", expectedVersion: 0, note: "Wrong amount" }).value);
    assert.ok(parseInvoiceReview({ status: "Disputed", expectedVersion: 0, note: "" }).error);
    assert.ok(parseInvoiceVoid({ expectedVersion: 1, reason: "Replaced invoice" }).value);
});

test("private invoice API scopes files, preserves review history and protects costs", async (t) => {
    let stored = null, category = "Booking";
    const logs = [];
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({ _id: id, name: "Finance",
        role: String(id) === ids.finance ? "Finance" : "Sales", status: "Active", tokenVersion: 0 }) }));
    t.mock.method(CostEntry, "findById", async (id) => String(id) === ids.cost ? new CostEntry({
        _id: ids.cost, recordType: category, recordId: ids.booking, category: "Hotel", description: "Beach House",
        amount: 125, currency: "USD", conversionRate: 1, targetCurrency: "USD", createdBy: ids.finance,
    }) : null);
    t.mock.method(Booking, "findById", () => ({ select: async () => ({ bookingCode: "DCJ-CI-INVOICE" }) }));
    t.mock.method(Invoice, "init", async () => {});
    t.mock.method(Invoice, "create", async (data) => {
        if (stored && !stored.voidedAt && stored.referenceKey === data.referenceKey) throw Object.assign(new Error("duplicate"), { code: 11000 });
        const doc = new Invoice({ _id: ids.invoice, __v: 0, ...data });
        await doc.validate(); stored = doc.toObject(); return doc;
    });
    t.mock.method(Invoice, "findOne", (query) => {
        const get = async () => {
            if (!stored || String(query._id) !== ids.invoice || String(query.cost) !== ids.cost) return null;
            const doc = Invoice.hydrate(stored);
            doc.save = async () => { await doc.validate(); doc.__v += 1; stored = doc.toObject(); return doc; };
            return doc;
        };
        return { select: get, then: (resolve, reject) => get().then(resolve, reject) };
    });
    t.mock.method(Invoice, "find", () => { const chain = { sort: () => chain, skip: () => chain, limit: () => chain,
        lean: async () => stored ? [stored] : [] }; return chain; });
    t.mock.method(Invoice, "countDocuments", async () => stored ? 1 : 0);
    t.mock.method(Invoice, "exists", async () => stored ? { _id: ids.invoice } : null);
    t.mock.method(ActivityLog, "create", async (value) => { logs.push(value); return value; });

    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}/api/finance/costs/${ids.cost}`;
    const request = (path, { method = "GET", body, raw, id = ids.finance, headers = {} } = {}) => fetch(base + path, {
        method, headers: { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}`,
            "Content-Type": raw ? "application/pdf" : "application/json", ...headers },
        body: raw || (body === undefined ? undefined : JSON.stringify(body)),
    });
    const upload = (version = 0, file = pdf) => request(`/invoices/${ids.invoice}/file?expectedVersion=${version}`,
        { method: "POST", raw: file, headers: { "X-File-Name": encodeURIComponent("PRIVATE THB.pdf") } });
    assert.equal((await request("/invoices", { id: ids.sales })).status, 403);
    assert.equal((await request("/invoices", { method: "POST", id: ids.sales, body: details() })).status, 403);
    category = "Quotation";
    assert.equal((await request("/invoices")).status, 400);
    category = "Booking";
    assert.equal((await request("/invoices?page=0")).status, 400);
    assert.equal((await request("/invoices", { method: "POST", body: { ...details(), amount: 0 } })).status, 400);
    const created = await request("/invoices", { method: "POST", body: { ...details(), data: "forged", status: "Approved" } });
    assert.equal(created.status, 201, await created.clone().text());
    const first = (await created.json()).invoice;
    assert.equal(first.status, "Received");
    assert.equal(first.filename, "");
    assert.equal(first.data, undefined);
    assert.equal((await request("/invoices", { method: "POST", body: details() })).status, 409);
    assert.equal((await request(`/invoices/${ids.invoice}/review`, { method: "PATCH",
        body: { status: "Approved", expectedVersion: 0, confirmed: true, confirmedDifference: true } })).status, 400);
    assert.equal((await upload(2)).status, 409);
    assert.equal((await upload(0, Buffer.from("bad pdf"))).status, 415);
    const attached = await upload();
    assert.equal(attached.status, 201, await attached.clone().text());
    const second = (await attached.json()).invoice;
    assert.equal(second.filename, "PRIVATE THB.pdf");
    assert.equal(second.__v, 1);
    assert.equal(second.sha256, undefined);
    assert.equal((await upload(1)).status, 409);
    const download = await request(`/invoices/${ids.invoice}/file`);
    assert.equal(download.status, 200);
    assert.equal(download.headers.get("content-type"), "application/octet-stream");
    assert.equal(download.headers.get("cache-control"), "no-store");
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), pdf);
    assert.equal((await request(`/invoices/${ids.sales}/file`)).status, 404);
    assert.equal((await request(`/invoices/${ids.invoice}/review`, { method: "PATCH",
        body: { status: "Approved", expectedVersion: 1, confirmed: true } })).status, 400);
    const approved = await request(`/invoices/${ids.invoice}/review`, { method: "PATCH",
        body: { status: "Approved", expectedVersion: 1, confirmed: true, confirmedDifference: true } });
    assert.equal(approved.status, 200, await approved.clone().text());
    assert.equal((await approved.json()).invoice.reviewHistory.length, 1);
    assert.equal((await request(`/invoices/${ids.invoice}/review`, { method: "PATCH",
        body: { status: "Approved", expectedVersion: 1, confirmed: true, confirmedDifference: true } })).status, 409);
    const dispute = await request(`/invoices/${ids.invoice}/review`, { method: "PATCH",
        body: { status: "Disputed", expectedVersion: 2, note: "Corrected bill requested" } });
    assert.equal(dispute.status, 200);
    assert.equal((await dispute.json()).invoice.reviewHistory.length, 2);
    const list = await (await request("/invoices")).json();
    assert.equal(list.items[0].status, "Disputed");
    assert.doesNotMatch(JSON.stringify(list), /data|sha256|referenceKey|PRIVATE THB.pdf.*%PDF/);
    assert.equal((await request("", { method: "DELETE" })).status, 409);
    const voided = await request(`/invoices/${ids.invoice}/void`, { method: "PATCH",
        body: { reason: "Superseded invoice", expectedVersion: 3 } });
    assert.equal(voided.status, 200);
    assert.equal((await request(`/invoices/${ids.invoice}/file`)).status, 410);
    assert.ok(logs.length >= 4);
    assert.doesNotMatch(JSON.stringify(logs), /THB27301|PRIVATE THB|130/);
});
