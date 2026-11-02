const test = require("node:test");
const assert = require("node:assert/strict");
const { gzipSync } = require("node:zlib");
const jwt = require("jsonwebtoken");
process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
const app = require("../app");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const CostEntry = require("../models/CostEntry");
const Attachment = require("../models/SupplierPaymentAttachment");
const ActivityLog = require("../models/ActivityLog");
const { parsePaymentFile, parseAcknowledgement, MAX_FILE_BYTES } = require("../utils/supplierPaymentEvidence");

const pdf = Buffer.from("%PDF-1.7\n% synthetic test document\n%%EOF\n");
const input = () => ({ data: pdf, contentType: "application/pdf", encodedName: encodeURIComponent("Bank receipt.pdf"), kind: "bank-proof" });
const acknowledgement = () => ({ action: "acknowledge", expectedVersion: 0, acknowledgedDate: "2026-01-16",
    channel: "Email", contactName: "PRIVATE CONTACT", reference: "PRIVATE RECEIPT", note: "PRIVATE NOTE", confirmed: true });

test("receipt validation binds the file signature, extension and MIME, rejects paths and limits bytes", () => {
    assert.equal(parsePaymentFile(input()).value.size, pdf.length);
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=", "base64");
    assert.ok(parsePaymentFile({ ...input(), data: png, contentType: "image/png", encodedName: "proof.PNG" }).value);
    assert.ok(parsePaymentFile({ ...input(), data: Buffer.from([255, 216, 255, 224, 255, 217]), contentType: "image/jpeg", encodedName: "proof.jpeg" }).value);
    for (const changes of [{ contentType: "text/html" }, { encodedName: "receipt.png" }, { data: Buffer.from("<html>not a receipt</html>") },
        { data: pdf.subarray(0, 15) }, { data: Buffer.alloc(0) }, { data: Buffer.alloc(MAX_FILE_BYTES + 1) }, { data: "string" },
        { encodedName: "../receipt.pdf" }, { encodedName: "%5Creceipt.pdf" }, { encodedName: "%00proof.pdf" },
        { encodedName: "%0D%0AInjected.pdf" }, { encodedName: "%E2%80%AEproof.pdf" }, { encodedName: "%invalid" },
        { encodedName: "x".repeat(151) + ".pdf" }, { kind: "unknown" }]) assert.ok(parsePaymentFile({ ...input(), ...changes }).error, Object.keys(changes).join(", "));
});

test("acknowledgements require actual confirmation, a contact and valid Sri Lanka dates", () => {
    const payment = { paymentDate: new Date("2026-01-15") }, now = new Date("2026-01-16T18:30:00Z");
    assert.ok(parseAcknowledgement(acknowledgement(), payment, now).value);
    assert.ok(parseAcknowledgement({ ...acknowledgement(), acknowledgedDate: "2026-01-17" }, payment, now).value);
    for (const changes of [{ acknowledgedDate: "2026-01-18" }, { acknowledgedDate: "2026-01-14" }, { acknowledgedDate: "2026-02-30" },
        { acknowledgedDate: "" }, { channel: "automatic" }, { contactName: " " }, { contactName: "A\nB" }, { note: "x".repeat(501) },
        { reference: [] }, { confirmed: "true" }, { confirmed: false }, { expectedVersion: -1 }, { expectedVersion: "0" }, { action: "invalid" }]) {
        assert.ok(parseAcknowledgement({ ...acknowledgement(), ...changes }, payment, now).error);
    }
    assert.ok(parseAcknowledgement(acknowledgement(), { paymentDate: null }, now).error);
    assert.ok(parseAcknowledgement({ action: "reopen", reason: "Wrong payment", expectedVersion: 1 }, payment, now).value);
    assert.ok(parseAcknowledgement({ action: "reopen", reason: " ", expectedVersion: 1 }, payment, now).error);
});

test("private payment API enforces permissions, ownership, safe downloads and auditable corrections", async (t) => {
    const ids = { cost: "507f1f77bcf86cd799439071", payment: "507f1f77bcf86cd799439072", booking: "507f1f77bcf86cd799439073",
        finance: "507f1f77bcf86cd799439074", sales: "507f1f77bcf86cd799439075", reader: "507f1f77bcf86cd799439076",
        missing: "507f1f77bcf86cd799439077", attachment: "507f1f77bcf86cd799439078" };
    let persisted = new CostEntry({ _id: ids.cost, __v: 0, recordType: "Booking", recordId: ids.booking,
        category: "Hotel", description: "PRIVATE COST", amount: 200, currency: "USD", conversionRate: 1, targetCurrency: "USD", paidAmount: 130,
        createdBy: ids.finance, paymentHistory: [{ _id: ids.payment, kind: "payment", amount: 130, paidAmountAfter: 130,
            paymentDate: new Date("2026-01-15"), method: "Bank transfer", recordedBy: ids.finance, recordedByName: "Staff" }] }).toObject();
    let stored = null, race = false;
    const logs = [];
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({ _id: id, name: "Staff", status: "Active",
        role: String(id) === ids.finance ? "Finance" : String(id) === ids.sales ? "Sales" : "Custom",
        customPermissions: String(id) === ids.reader ? ["cost.view"] : [] }) }));
    t.mock.method(CostEntry, "findById", async (id) => {
        if (String(id) !== ids.cost) return null;
        const doc = CostEntry.hydrate(persisted);
        doc.save = async () => {
            if (race) throw Object.assign(new Error("Concurrent edit"), { name: "VersionError" });
            await doc.validate(); doc.__v += 1; persisted = doc.toObject(); return doc;
        };
        return doc;
    });
    t.mock.method(Booking, "findById", () => ({ select: async () => ({ bookingCode: "CI-PAYMENT" }) }));
    t.mock.method(ActivityLog, "create", async (entry) => { logs.push(entry); return entry; });
    t.mock.method(Attachment, "init", async () => {});
    const owns = (query) => stored && String(query.cost) === ids.cost && String(query.paymentId) === ids.payment && (!query._id || String(query._id) === ids.attachment);
    t.mock.method(Attachment, "find", (query) => {
        const chain = { sort: () => chain, skip: () => chain, limit: () => chain, select: () => chain,
            lean: async () => owns(query) && (query.withdrawnAt === null ? !stored.withdrawnAt : stored.withdrawnAt) ? [stored] : [] };
        return chain;
    });
    t.mock.method(Attachment, "countDocuments", async () => stored?.withdrawnAt ? 1 : 0);
    t.mock.method(Attachment, "create", async (entry) => { stored = { ...entry, _id: ids.attachment, uploadedAt: new Date(), withdrawnAt: null }; return stored; });
    t.mock.method(Attachment, "findOne", (query) => ({ select: async () => owns(query) ? stored : null }));
    t.mock.method(Attachment, "findOneAndUpdate", async (query, change) => {
        if (!owns(query) || stored.withdrawnAt) return null;
        Object.assign(stored, change.$set); return stored;
    });
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}/api/finance/costs/${ids.cost}/payments/${ids.payment}`;
    const request = (path, { id = ids.finance, method = "GET", body, raw, headers = {} } = {}) => fetch(`${base}${path}`, {
        method, headers: { ...(id ? { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` } : {}),
            "Content-Type": raw ? "application/pdf" : "application/json", ...headers }, body: raw || (body === undefined ? undefined : JSON.stringify(body)),
    });
    const upload = (options = {}) => request("/attachments?kind=bank-proof", { method: "POST", raw: pdf,
        headers: { "X-File-Name": encodeURIComponent("PRIVATE FILE.pdf") }, ...options });
    for (const path of ["/attachments", "/acknowledgement", `/attachments/${ids.attachment}`]) {
        assert.equal((await request(path, { id: null })).status, 401);
        assert.equal((await request(path, { id: ids.sales })).status, 403);
    }
    assert.equal((await upload({ id: ids.reader })).status, 403);
    assert.equal((await request("/acknowledgement", { id: ids.reader, method: "PATCH", body: acknowledgement() })).status, 403);
    assert.equal((await request("/acknowledgement", { id: ids.reader })).status, 200);
    assert.equal((await request("/attachments?historyPage=0")).status, 400);
    assert.equal((await upload({ raw: Buffer.alloc(MAX_FILE_BYTES + 1) })).status, 413);
    assert.equal((await upload({ raw: gzipSync(pdf), headers: { "Content-Encoding": "gzip" } })).status, 415);
    assert.equal((await upload({ raw: Buffer.from("not PDF") })).status, 415);
    const preflight = await request("/attachments", { id: null, method: "OPTIONS", headers: { Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,authorization,x-file-name" } });
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get("access-control-allow-headers"), /X-File-Name/i);
    const saved = await upload();
    assert.equal(saved.status, 201, await saved.clone().text());
    assert.equal(saved.headers.get("cache-control"), "no-store");
    assert.doesNotMatch(await saved.text(), /sha256|"data"|paymentId/);
    const list = await (await request("/attachments", { id: ids.reader })).json();
    assert.equal(list.active.length, 1);
    assert.doesNotMatch(JSON.stringify(list), /sha256|"data"/);
    assert.equal((await request(`/attachments/${ids.missing}`)).status, 404);
    const download = await request(`/attachments/${ids.attachment}`, { id: ids.reader });
    assert.equal(download.status, 200);
    assert.equal(download.headers.get("content-type"), "application/octet-stream");
    assert.match(download.headers.get("content-disposition"), /^attachment;/);
    assert.equal(download.headers.get("x-content-type-options"), "nosniff");
    assert.equal(download.headers.get("cache-control"), "no-store");
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), pdf);
    stored.data = Buffer.from("corrupt");
    assert.equal((await request(`/attachments/${ids.attachment}`)).status, 409);
    stored.data = pdf;
    assert.equal((await request(`/attachments/${ids.attachment}/withdraw`, { method: "PATCH", body: { reason: "" } })).status, 400);
    assert.equal((await request(`/attachments/${ids.attachment}/withdraw`, { method: "PATCH", body: { reason: "PRIVATE REASON" } })).status, 200);
    assert.equal((await request(`/attachments/${ids.attachment}`)).status, 410);
    assert.equal((await request(`/attachments/${ids.attachment}/withdraw`, { method: "PATCH", body: { reason: "duplicate" } })).status, 409);
    const withdrawn = await (await request("/attachments")).json();
    assert.equal(withdrawn.active.length, 0);
    assert.equal(withdrawn.history[0].withdrawalReason, "PRIVATE REASON");
    assert.deepEqual(stored.data, pdf);
    const patch = (body) => request("/acknowledgement", { method: "PATCH", body });
    assert.equal((await patch({ ...acknowledgement(), expectedVersion: 9 })).status, 409);
    race = true;
    assert.equal((await patch(acknowledgement())).status, 409);
    race = false;
    const acknowledged = await patch(acknowledgement());
    assert.equal(acknowledged.status, 200, await acknowledged.clone().text());
    assert.equal((await acknowledged.json()).history.length, 1);
    assert.equal((await patch({ ...acknowledgement(), expectedVersion: 1 })).status, 409);
    assert.equal((await patch({ action: "reopen", expectedVersion: 0, reason: "Wrong payment" })).status, 409);
    const reopened = await patch({ action: "reopen", expectedVersion: 1, reason: "PRIVATE REOPEN" });
    assert.equal(reopened.status, 200);
    const state = await reopened.json();
    assert.equal(state.current, null);
    assert.equal(state.version, 2);
    assert.equal(state.history[1].acknowledgement.contactName, "PRIVATE CONTACT");
    assert.equal((await patch({ action: "reopen", expectedVersion: 2, reason: "Wrong payment" })).status, 409);
    assert.equal(persisted.paidAmount, 130);
    assert.equal(persisted.paymentHistory[0].amount, 130);
    assert.equal(persisted.paymentHistory[0].reconciledAt, null);
    assert.equal(persisted.paymentHistory[0].remittanceRevisions.length, 0);
    assert.equal(logs.length, 4);
    assert.doesNotMatch(JSON.stringify(logs), /PRIVATE/);
    persisted.paymentHistory[0].kind = "adjustment";
    assert.equal((await request("/attachments")).status, 404);
});
