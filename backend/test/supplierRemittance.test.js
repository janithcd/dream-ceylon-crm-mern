const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { PDFDocument } = require("pdf-lib");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
const app = require("../app");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const CostEntry = require("../models/CostEntry");
const CompanySetting = require("../models/CompanySetting");
const ActivityLog = require("../models/ActivityLog");
const { getRemittancePayment, parseRemittanceDetails, publicRemittance, buildRemittanceEmail } = require("../utils/supplierRemittance");
const { createSupplierRemittancePdf } = require("../controllers/supplierRemittancePdf");

const ids = { cost: "507f1f77bcf86cd799439061", payment: "507f1f77bcf86cd799439062", booking: "507f1f77bcf86cd799439063",
    finance: "507f1f77bcf86cd799439064", sales: "507f1f77bcf86cd799439065", readOnly: "507f1f77bcf86cd799439066",
    pdfOnly: "507f1f77bcf86cd799439067", missing: "507f1f77bcf86cd799439068" };
const exampleCost = () => new CostEntry({ _id: ids.cost, __v: 0, recordType: "Booking", recordId: ids.booking,
    category: "Hotel", description: "PRIVATE COST DESCRIPTION", amount: 200, currency: "USD", conversionRate: 1,
    targetCurrency: "USD", paidAmount: 130, createdBy: ids.finance,
    paymentHistory: [{ _id: ids.payment, kind: "payment", amount: 130, paidAmountAfter: 130,
        paymentDate: new Date("2026-01-15"), method: "Bank transfer", reference: "BANK-TEST-123",
        note: "PRIVATE PAYMENT NOTE", recordedBy: ids.finance, recordedByName: "Internal Staff" }] });
const details = () => ({ supplierName: "Example Beach Hotel", supplierEmail: "accounts@example.invalid",
    invoiceReference: "PF-EXAMPLE-123", guestReference: "Alex Example / 10-11 March 2027",
    transferAmount: "39000.00", transferCurrency: "LKR", transferReference: "BANK-TEST-123", confirmed: true });
const company = { companyName: "Dream Ceylon Journeys", email: "info@example.invalid" };
const readPdf = async (bytes) => {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({ data: new Uint8Array(bytes), disableFontFace: true, useSystemFonts: false });
    try {
        const doc = await task.promise;
        const pages = [];
        for (let number = 1; number <= doc.numPages; number += 1) {
            const content = await (await doc.getPage(number)).getTextContent();
            pages.push(content.items.map(({ str }) => str).join(" "));
        }
        return pages.join(" ");
    } finally { await task.destroy(); }
};

test("remittance requires a real, dated payment and reviewed transfer currency without guessing an exchange rate", () => {
    const cost = exampleCost();
    const payment = cost.paymentHistory[0];
    const summary = getRemittancePayment(cost, payment).value;
    assert.equal(summary.amount, 130);
    const parsed = parseRemittanceDetails(details(), summary).value;
    assert.equal(parsed.transferAmount, 39000);
    assert.equal(parsed.transferCurrency, "LKR");
    assert.equal(payment.amount, 130);
    assert.match(getRemittancePayment(cost, { ...payment.toObject(), kind: "adjustment" }).error, /individual/);
    assert.match(getRemittancePayment({ ...cost.toObject(), recordType: "Quotation" }, payment).error, /individual/);
    assert.match(getRemittancePayment(cost, { ...payment.toObject(), paymentDate: null }).error, /date/);
    assert.match(getRemittancePayment(cost, { ...payment.toObject(), paymentDate: new Date("2099-01-01") }).error, /future/);
    assert.match(getRemittancePayment(cost, { ...payment.toObject(), amount: -1 }).error, /positive/);
    assert.match(getRemittancePayment({ ...cost.toObject(), currency: "BAD" }, payment).error, /individual/);
    for (const transferAmount of ["", null, true, [], 0, -1, 0.001, Infinity, 1000000001]) {
        assert.ok(parseRemittanceDetails({ ...details(), transferAmount }, summary).error, String(transferAmount));
    }
    assert.match(parseRemittanceDetails({ ...details(), transferCurrency: "USD" }, summary).error, /match/);
    assert.equal(parseRemittanceDetails({ ...details(), transferCurrency: "USD", transferAmount: 130 }, summary).value.transferAmount, 130);
    assert.match(parseRemittanceDetails({ ...details(), transferCurrency: "AUD" }, summary).error, /currency/);
    assert.match(parseRemittanceDetails({ ...details(), confirmed: false }, summary).error, /Check/);
    assert.match(parseRemittanceDetails({ ...details(), transferReference: "" }, summary).error, /reference/);
    assert.ok(parseRemittanceDetails({ ...details(), transferReference: "" }, { ...summary, method: "Cash" }).value);
});

test("remittance rejects injected recipients, multiline fields, oversized details and unreasoned corrections", () => {
    const summary = getRemittancePayment(exampleCost(), exampleCost().paymentHistory[0]).value;
    for (const supplierEmail of ["a@example.invalid,b@example.invalid", "a@example.invalid\r\nBcc: b@example.invalid", "bad", "x".repeat(255)]) {
        assert.ok(parseRemittanceDetails({ ...details(), supplierEmail }, summary).error);
    }
    for (const changes of [{ supplierName: "" }, { invoiceReference: "" }, { supplierName: "x".repeat(161) },
        { invoiceReference: "hello\nSubject: injected" }, { guestReference: "x".repeat(201) },
        { transferReference: "x".repeat(101) }, { changeReason: "x".repeat(301) }]) {
        assert.ok(parseRemittanceDetails({ ...details(), ...changes }, summary).error);
    }
    assert.match(parseRemittanceDetails(details(), summary, true).error, /reason/);
    assert.ok(parseRemittanceDetails({ ...details(), changeReason: "Corrected invoice reference", supplierEmail: "" }, summary, true).value);
});

test("supplier PDF and email use only reviewed fields, support multilingual names and do not certify full settlement", async () => {
    const revision = { ...details(), revision: 1, transferAmount: 39000, bookingCode: "DCJ-TEST-1",
        paymentDate: new Date("2026-01-15"), method: "Bank transfer", issuedAt: new Date("2026-01-16"),
        supplierName: "Example Hotel / සිංහල / தமிழ் / Жанна", changeReason: "PRIVATE CORRECTION", recordedByName: "PRIVATE STAFF",
        costDescription: "PRIVATE COST", note: "PRIVATE NOTE", paidAmountAfter: 999, sellingPrice: 5555 };
    const voucher = publicRemittance(ids.payment, revision);
    const draft = buildRemittanceEmail(voucher, company);
    assert.equal(draft.recipient, details().supplierEmail);
    assert.match(draft.body, /LKR 39,000.00/);
    assert.match(draft.body, /acknowledge receipt/);
    assert.doesNotMatch(draft.body, /attached|fully paid|PRIVATE|999|5555|USD 130/i);
    const bytes = await createSupplierRemittancePdf(voucher, company);
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
    const printed = await readPdf(bytes);
    for (const expected of ["SUPPLIER PAYMENT VOUCHER", "PF-EXAMPLE-123", "BANK-TEST-123", "LKR 39,000.00", "Jan 15, 2026",
        "not bank proof", "does not certify", "info@example.invalid"]) assert.ok(printed.includes(expected), expected);
    for (const name of ["සිංහල", "தமிழ்", "Жанна"]) assert.ok(printed.replace(/\s+/gu, "").includes(name), name);
    assert.doesNotMatch(printed, /PRIVATE|999|5555|USD 130/);
    assert.doesNotMatch(JSON.stringify(voucher), /PRIVATE|999|5555/);
    const longBytes = await createSupplierRemittancePdf({ ...voucher, supplierName: "Long hotel name ".repeat(10),
        supplierEmail: "x".repeat(235) + "@example.invalid", invoiceReference: "PF".repeat(40),
        guestReference: "Long guest reservation ".repeat(60) + "FINAL GUEST", transferReference: "REF".repeat(33) }, company);
    assert.ok((await PDFDocument.load(longBytes)).getPageCount() >= 2);
    assert.match(await readPdf(longBytes), /does not certify/);
    assert.match(await readPdf(longBytes), /FINAL GUEST/);
});

test("voucher API enforces permissions, preserves ledger and revisions, rejects stale updates and logs without private data", async (t) => {
    let persisted = exampleCost().toObject();
    let race = false;
    let bookingExists = true;
    const logs = [];
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({ _id: id, name: "Internal Staff", status: "Active",
        role: String(id) === ids.finance ? "Finance" : String(id) === ids.sales ? "Sales" : "Unknown Role",
        customPermissions: String(id) === ids.readOnly ? ["cost.view"] : String(id) === ids.pdfOnly ? ["pdf.generate"] : [],
    }) }));
    t.mock.method(CostEntry, "findById", async (id) => {
        if (String(id) !== ids.cost) return null;
        const doc = CostEntry.hydrate(persisted);
        doc.save = async () => {
            if (race) throw Object.assign(new Error("Synthetic concurrent save"), { name: "VersionError" });
            await doc.validate();
            doc.__v += 1;
            persisted = doc.toObject();
            return doc;
        };
        return doc;
    });
    t.mock.method(Booking, "findById", () => ({ select: async () => bookingExists ? { _id: ids.booking, bookingCode: "DCJ-TEST-1" } : null }));
    t.mock.method(CompanySetting, "findOne", async () => null);
    t.mock.method(ActivityLog, "create", async (entry) => { logs.push(entry); return entry; });
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const endpoint = `http://127.0.0.1:${server.address().port}/api/finance/costs/${ids.cost}/payments/${ids.payment}/remittance`;
    const request = ({ method = "GET", id = ids.finance, body, url = endpoint } = {}) => fetch(url, {
        method, headers: { ...(id ? { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` } : {}), "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    assert.equal((await request({ id: null })).status, 401);
    assert.equal((await request({ id: ids.sales })).status, 403);
    assert.equal((await request({ id: ids.pdfOnly })).status, 403);
    assert.equal((await request({ id: ids.readOnly })).status, 200);
    assert.equal((await request({ id: ids.readOnly, method: "PUT", body: details() })).status, 403);
    assert.equal((await request({ id: ids.readOnly, method: "POST", url: `${endpoint}/pdf`, body: { revision: 1 } })).status, 403);
    assert.equal((await request({ id: ids.pdfOnly, method: "POST", url: `${endpoint}/pdf`, body: { revision: 1 } })).status, 403);
    assert.equal((await request({ url: endpoint.replace(ids.cost, "bad") })).status, 400);
    assert.equal((await request({ url: endpoint.replace(ids.cost, ids.missing) })).status, 404);
    assert.equal((await request({ url: endpoint.replace(ids.payment, ids.missing) })).status, 404);
    bookingExists = false;
    assert.equal((await request()).status, 404);
    bookingExists = true;
    const initial = await (await request()).json();
    assert.equal(initial.current, null);
    assert.equal(initial.draft, null);
    assert.equal((await request({ method: "POST", url: `${endpoint}/pdf`, body: { revision: 1 } })).status, 409);
    assert.equal((await request({ method: "PUT", body: details() })).status, 400);
    assert.equal((await request({ method: "PUT", body: { ...details(), expectedVersion: 9 } })).status, 409);
    assert.equal(logs.length, 0);
    const saved = await request({ method: "PUT", body: { ...details(), expectedVersion: 0 } });
    assert.equal(saved.status, 201);
    assert.equal(saved.headers.get("cache-control"), "no-store");
    const first = await saved.json();
    assert.equal(first.current.revision, 1);
    assert.equal(first.version, 1);
    assert.equal(persisted.paidAmount, 130);
    assert.equal(persisted.currency, "USD");
    assert.equal(persisted.paymentHistory.length, 1);
    assert.equal(persisted.paymentHistory[0].amount, 130);
    assert.equal(first.current.transferAmount, 39000);
    assert.equal((await request({ method: "PUT", body: { ...details(), expectedVersion: 0, changeReason: "Stale tab" } })).status, 409);
    assert.equal((await request({ method: "PUT", body: { ...details(), expectedVersion: 1 } })).status, 400);
    race = true;
    assert.equal((await request({ method: "PUT", body: { ...details(), expectedVersion: 1, changeReason: "Concurrent update" } })).status, 409);
    assert.equal(persisted.paymentHistory[0].remittanceRevisions.length, 1);
    race = false;
    const corrected = await request({ method: "PUT", body: { ...details(), invoiceReference: "PF-CORRECTED-123", expectedVersion: 1, changeReason: "PRIVATE CORRECTION" } });
    assert.equal(corrected.status, 201);
    const second = await corrected.json();
    assert.equal(second.current.revision, 2);
    assert.equal(second.current.invoiceReference, "PF-CORRECTED-123");
    assert.equal(second.history[0].invoiceReference, "PF-EXAMPLE-123");
    assert.equal(second.history[1].changeReason, "PRIVATE CORRECTION");
    assert.equal((await request({ method: "POST", url: `${endpoint}/pdf`, body: { revision: 1 } })).status, 409);
    const pdf = await request({ method: "POST", url: `${endpoint}/pdf`, body: { revision: 2 } });
    assert.equal(pdf.status, 200);
    assert.match(pdf.headers.get("content-type"), /application\/pdf/);
    assert.match(pdf.headers.get("content-disposition"), /SPV-507F1F77BCF86CD799439062-r2.pdf/);
    assert.equal(pdf.headers.get("cache-control"), "no-store");
    assert.match(await readPdf(await pdf.arrayBuffer()), /PF-CORRECTED-123/);
    assert.equal(logs.length, 3);
    assert.doesNotMatch(JSON.stringify(logs), /PRIVATE|39000|39,000|130|PF-EXAMPLE|PF-CORRECTED|accounts@example/);
    assert.equal(logs.at(-1).metadata.documentType, "Supplier Payment Voucher");
    persisted.paymentHistory[0].kind = "adjustment";
    assert.equal((await request()).status, 404);
});
