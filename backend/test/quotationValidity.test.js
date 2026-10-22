const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
process.env.AUTH_RATE_LIMIT_MAX = "1000";

const app = require("../app");
const Admin = require("../models/Admin");
const ActivityLog = require("../models/ActivityLog");
const CompanySetting = require("../models/CompanySetting");
const { parseQuotationValidUntil, getQuotationValidityState, getValidityQuery } = require("../utils/quotationValidity");

test("quotation validity uses Colombo calendar days and only flags sent offers", () => {
    const now = new Date("2026-10-16T19:00:00Z"); // October 17 in Sri Lanka
    assert.equal(parseQuotationValidUntil("2027-02-28").value.toISOString(), "2027-02-28T00:00:00.000Z");
    assert.equal(parseQuotationValidUntil(null).value, null);
    for (const invalid of ["2027-02-30", "2027/02/28", 123]) assert.ok(parseQuotationValidUntil(invalid).error);
    assert.equal(getQuotationValidityState({ status: "Sent", validUntil: "2026-10-16" }, now), "pastDue");
    assert.equal(getQuotationValidityState({ status: "Sent", validUntil: "2026-10-17" }, now), "dueSoon");
    assert.equal(getQuotationValidityState({ status: "Sent", validUntil: "2026-10-23" }, now), "dueSoon");
    assert.equal(getQuotationValidityState({ status: "Sent", validUntil: "2026-10-24" }, now), "current");
    assert.equal(getQuotationValidityState({ status: "Accepted", validUntil: "2026-10-16" }, now), "none");
    assert.equal(getQuotationValidityState({ status: "Sent", validUntil: null }, now), "none");
    assert.deepEqual(getValidityQuery("pastDue", now), { status: "Sent", validUntil: { $lt: new Date("2026-10-16T18:30:00Z") } });
    assert.deepEqual(getValidityQuery("dueSoon", now), {
        status: "Sent", validUntil: { $gte: new Date("2026-10-16T18:30:00Z"), $lte: new Date("2026-10-23T18:29:59.999Z") },
    });
    assert.deepEqual(getValidityQuery("noDate", now), { status: "Sent", validUntil: null });
});

test("quotation PDF prints saved identity and validity without changing absent dates", async (t) => {
    const adminId = "507f1f77bcf86cd799439601";
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({
        _id: id, role: "Sales", status: "Active", tokenVersion: 0,
    }) }));
    t.mock.method(CompanySetting, "findOne", async () => null);
    t.mock.method(ActivityLog, "create", async () => ({}));
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}/api/quotations/pdf`;
    const request = (body) => fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt.sign({ id: adminId }, process.env.JWT_SECRET)}`, "Content-Type": "application/json" },
        body: JSON.stringify({ quotationNo: "DCJ-Q-2026-123456", quotationDate: "2026-10-22", clientName: "Test Guest", tourTitle: "Sri Lanka Tour", ...body }),
    });
    assert.equal((await request({ validUntil: "2027-02-30" })).status, 400);
    const response = await request({ validUntil: "2027-03-14" });
    assert.equal(response.status, 200, response.statusText);
    assert.match(response.headers.get("content-type"), /application\/pdf/);
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({ data: new Uint8Array(await response.arrayBuffer()), disableFontFace: true, useSystemFonts: false });
    try {
        const document = await task.promise;
        const page = await document.getPage(1);
        const content = await page.getTextContent();
        const printed = content.items.map(({ str }) => str).join(" ");
        assert.match(printed, /Quotation No: DCJ-Q-2026-123456/);
        assert.match(printed, /Date: October 22, 2026/);
        assert.match(printed, /Valid until: March 14, 2027/);
    } finally {
        await task.destroy();
    }
    const legacy = await request({});
    assert.equal(legacy.status, 200);
    const legacyPdf = getDocument({ data: new Uint8Array(await legacy.arrayBuffer()), disableFontFace: true, useSystemFonts: false });
    try {
        const content = await (await (await legacyPdf.promise).getPage(1)).getTextContent();
        assert.doesNotMatch(content.items.map(({ str }) => str).join(" "), /Valid until:/);
    } finally {
        await legacyPdf.destroy();
    }
});
