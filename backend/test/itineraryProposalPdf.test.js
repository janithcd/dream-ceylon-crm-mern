const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
process.env.AUTH_RATE_LIMIT_MAX = "1000";

const app = require("../app");
const Admin = require("../models/Admin");
const CompanySetting = require("../models/CompanySetting");
const ActivityLog = require("../models/ActivityLog");
const { needsUnicodeItineraryPdf } = require("../utils/unicodeItineraryPdf");

test("proposal chooses a Unicode renderer for non-Latin guest and itinerary text", async (t) => {
    assert.equal(needsUnicodeItineraryPdf("Ashlee Reed", "Day 1: Colombo"), false);
    assert.equal(needsUnicodeItineraryPdf("සිංහල", "Day 1: Colombo"), true);
    assert.equal(needsUnicodeItineraryPdf("Colombo → Kandy"), true);
    const adminId = "507f1f77bcf86cd799439313";
    const logs = [];
    t.mock.method(Admin, "findById", () => ({ select: async () => ({
        _id: adminId, status: "Active", role: "Super Admin", tokenVersion: 0,
    }) }));
    t.mock.method(CompanySetting, "findOne", async () => null);
    t.mock.method(ActivityLog, "create", async (entry) => { logs.push(entry); return entry; });
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}/api/pdf/itinerary`;
    const request = (body) => fetch(url, { method: "POST",
        headers: { Authorization: `Bearer ${jwt.sign({ id: adminId }, process.env.JWT_SECRET)}`,
            "Content-Type": "application/json" }, body: JSON.stringify(body),
    });

    const generatedItinerary = ["Day 1: Коломбо - සිංහල - தமிழ்",
        ...Array.from({ length: 44 }, (_, i) => `Day ${i + 2}: Guided trip to Канди and யாழ்ப்பாணம்.`)].join("\n");
    const response = await request({ clientName: "Анна / සිංහල / தமிழ்", country: "Poland",
        travelers: 2, durationDays: 12, vehicleType: "Car", generatedItinerary });
    if (response.status !== 200) assert.fail(await response.text());
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({ data: new Uint8Array(await response.arrayBuffer()),
        disableFontFace: true, useSystemFonts: false });
    try {
        const document = await task.promise;
        assert.ok(document.numPages > 1);
        const pages = [];
        for (let page = 1; page <= document.numPages; page += 1) {
            const content = await (await document.getPage(page)).getTextContent();
            pages.push(content.items.map(({ str }) => str).join(" "));
        }
        // PDF.js may split a Sinhala combining mark into adjacent text items.
        const printed = pages.join(" ").replace(/\s+/gu, "");
        for (const value of ["Анна", "සිංහල", "தமிழ்", "Коломбо", "யாழ்ப்பாணம்", "Day 45"]) {
            assert.ok(printed.includes(value.replace(/\s+/gu, "")), value);
        }
        assert.match(pages.at(-1).replace(/\s+/gu, ""), /Day40:.*Day45:/u);
    } finally { await task.destroy(); }
    assert.equal(logs.at(-1).metadata.renderer, "Unicode");
    assert.equal(logs.at(-1).customerName, "Анна / සිංහල / தமிழ்");

    const ascii = await request({ clientName: "Ashlee Reed", generatedItinerary: "Day 1: Colombo" });
    assert.equal(ascii.status, 200);
    assert.equal(Buffer.from(await ascii.arrayBuffer()).subarray(0, 5).toString(), "%PDF-");
    assert.equal(logs.at(-1).metadata.renderer, "Standard");
});
