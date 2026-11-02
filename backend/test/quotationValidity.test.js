const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
process.env.AUTH_RATE_LIMIT_MAX = "1000";

const app = require("../app");
const Admin = require("../models/Admin");
const Quotation = require("../models/Quotation");
const ActivityLog = require("../models/ActivityLog");
const CompanySetting = require("../models/CompanySetting");
const { PDFDocument } = require("pdf-lib");
const { createQuotationPdf, calculateQuotationTotals } = require("../controllers/quotationController");
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

test("quotation preview is visibly a draft and preserves the requested validity date", async (t) => {
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
        assert.match(printed, /DRAFT - NOT SAVED/);
        assert.match(printed, /Quotation No: DRAFT/);
        assert.doesNotMatch(printed, /DCJ-Q-2026-123456/);
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

test("official quotation PDF uses saved prices and identity, never browser overrides", async (t) => {
    const id = "507f1f77bcf86cd799439091";
    const adminId = "507f1f77bcf86cd799439092";
    const quotation = { _id: id, quotationNo: "DCJ-Q-2026-123456", status: "Sent",
        clientName: "Saved Guest", country: "UK", tourTitle: "Saved Tour",
        createdAt: new Date("2026-10-22"), validUntil: new Date("2027-03-14"),
        travelStartDate: new Date("2027-02-27"), travelEndDate: new Date("2027-03-13"),
        travelers: 2, durationDays: 15, vehicleType: "Car", vehicleDays: 15,
        vehicleDailyRate: 86, hotelCost: 1326, activitiesCost: 0,
        entranceFeesCost: 0, otherCost: 0, discount: 0, advancePayment: 663,
        currency: "USD", totals: { grandTotal: 2616, advancePayment: 663, balancePayment: 1953 },
        inclusions: ["Airport transfers"], exclusions: ["Entrance fees"],
        notes: "Saved note", adminNotes: "PRIVATE NOTE" };
    t.mock.method(Admin, "findById", () => ({ select: async () => ({
        _id: adminId, status: "Active", role: "Super Admin", email: "admin@example.invalid",
    }) }));
    t.mock.method(Quotation, "findById", () => ({ lean: async () => quotation }));
    t.mock.method(CompanySetting, "findOne", async () => null);
    t.mock.method(ActivityLog, "create", async () => ({}));
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}/api/quotations/${id}/pdf`;
    assert.equal((await fetch(url, { method: "POST" })).status, 401);
    assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/api/quotations/bad/pdf`, {
        method: "POST", headers: { Authorization: `Bearer ${jwt.sign({ id: adminId }, process.env.JWT_SECRET)}` },
    })).status, 400);
    const response = await fetch(url, { method: "POST",
        headers: { Authorization: `Bearer ${jwt.sign({ id: adminId }, process.env.JWT_SECRET)}`,
            "Content-Type": "application/json" },
        body: JSON.stringify({ clientName: "Forged Guest", vehicleDailyRate: 1,
            hotelCost: 0, quotationNo: "DCJ-Q-2026-999999" }),
    });
    if (response.status !== 200) assert.fail(await response.text());
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({ data: new Uint8Array(await response.arrayBuffer()), disableFontFace: true, useSystemFonts: false });
    try {
        const document = await task.promise;
        const contents = [];
        for (let page = 1; page <= document.numPages; page += 1) {
            const content = await (await document.getPage(page)).getTextContent();
            contents.push(...content.items.map(({ str }) => str));
        }
        const printed = contents.join(" ");
        for (const value of ["Saved Guest", "DCJ-Q-2026-123456", "USD 2,616.00", "Saved note"]) {
            assert.ok(printed.includes(value), value);
        }
        assert.doesNotMatch(printed, /Forged Guest|999999|PRIVATE NOTE|DRAFT - NOT SAVED/);
    } finally { await task.destroy(); }
    quotation.totals.grandTotal = 100;
    const stale = await fetch(url, { method: "POST",
        headers: { Authorization: `Bearer ${jwt.sign({ id: adminId }, process.env.JWT_SECRET)}` } });
    assert.equal(stale.status, 409);
    quotation.totals.grandTotal = 2616;
    quotation.totals.advancePayment = 999;
    const wrongAdvance = await fetch(url, { method: "POST",
        headers: { Authorization: `Bearer ${jwt.sign({ id: adminId }, process.env.JWT_SECRET)}` } });
    assert.equal(wrongAdvance.status, 409);
});

test("quotation PDF retains international client text, pricing and long inclusions across pages", async () => {
    const data = {
        quotationNo: "DCJ-Q-2026-123456", quotationDate: "2026-10-22", validUntil: "2026-11-10",
        clientName: "Łukasz / Анна / සිංහල / தமிழ்", country: "Polska",
        tourTitle: "Sigiriya - ąęź / Канди / සිංහල / தமிழ்",
        travelStartDate: "2026-11-27", travelEndDate: "2026-12-07", travelers: 4,
        durationDays: 10, vehicleType: "Van", currency: "USD",
        inclusions: ["Chauffeur guide and drinking water", ...Array.from({ length: 65 }, (_, index) => `Day ${index + 1}: transport to a selected Sri Lanka destination.`)],
        exclusions: ["Meals unless mentioned", "Entrance fees"],
        notes: "Guest-facing note: this itinerary is customized for your group.",
    };
    const totals = calculateQuotationTotals({ vehicleDays: 10, vehicleDailyRate: 92,
        hotelCost: 200, discount: 20, advancePayment: 300 });
    const bytes = await createQuotationPdf(data, totals, { companyName: "Dream Ceylon Journeys",
        email: "info@example.invalid", website: "https://example.invalid" });
    assert.ok((await PDFDocument.load(bytes)).getPageCount() > 2);
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({ data: new Uint8Array(bytes), disableFontFace: true, useSystemFonts: false });
    try {
        const document = await task.promise;
        const content = [];
        for (let page = 1; page <= document.numPages; page += 1) {
            content.push(...(await (await document.getPage(page)).getTextContent()).items.map(({ str }) => str));
        }
        const printed = content.join(" ");
        const compact = content.join("").replace(/\s+/gu, "");
        for (const value of ["Łukasz", "Анна", "සිංහල", "தமிழ்", "ąęź"]) {
            assert.ok(compact.includes(value), value);
        }
        for (const value of ["USD 1,100.00", "USD -20.00", "USD 800.00", "Advance requested",
            "Remaining after advance", "November 10, 2026", "Day 65:", "Guest-facing note:",
            "this quotation does not confirm any money received"]) {
            assert.ok(printed.includes(value), value);
        }
    } finally {
        await task.destroy();
    }
});

test("a normal hotel-and-transport quote does not add an almost empty last page", async () => {
    const data = {
        quotationNo: "DCJ-Q-2026-123456", quotationDate: "2026-11-02", clientName: "Example Guest",
        country: "United Kingdom", tourTitle: "Example 15D 14N Sri Lanka Tour",
        travelStartDate: "2027-02-27", travelEndDate: "2027-03-13", travelers: 2, durationDays: 15,
        vehicleType: "Car", currency: "USD",
        inclusions: ["Private air-conditioned car", "Professional chauffeur guide", "Airport pickup and drop-off",
            "Customized route planning", "Hotel accommodation", "Train tickets", "Water bottles during transfers"],
        exclusions: ["Entrance fees", "Safari and activity fees", "Meals outside the listed hotel meal plans", "Personal expenses"],
        notes: "Hotel stays, room categories and meal plans are as listed in this quotation. The order or timing of sightseeing may change due to weather, train schedules or local operating conditions. We will discuss any significant changes with you in advance.",
    };
    const totals = calculateQuotationTotals({ vehicleDays: 15, vehicleDailyRate: 86, hotelCost: 1326, advancePayment: 663 });
    const bytes = await createQuotationPdf(data, totals, { companyName: "Dream Ceylon Journeys",
        tagline: "Sri Lanka Private Tours & Tailor-Made Holidays", address: "Sri Lanka", mobiles: ["+94766550304"],
        email: "info@example.invalid", website: "https://example.invalid", whatsapp: "+94766550304" });
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 2);
});
