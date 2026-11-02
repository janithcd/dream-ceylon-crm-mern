const fs = require("node:fs");
const PDFDocument = require("pdfkit");
const { createBriefText } = require("./briefPdfText");

const WIDTH = 595.28;
const HEIGHT = 841.89;
const MARGIN = 46;
const CONTENT = WIDTH - MARGIN * 2;
const SAFE_BOTTOM = HEIGHT - 110;
const green = "#064e3b";
const teal = "#0f766e";
const muted = "#586874";
const ink = "#19262d";

// The legacy PDF-lib template uses Helvetica and removes unsupported characters
// before drawing. Its common punctuation replacements can stay on that layout.
const needsUnicodeItineraryPdf = (...values) => values.some((value) =>
    /[^\x09\x0a\x0d\x20-\x7eÀ-ÿ]/u.test(
        String(value ?? "").replace(/[“”‘’–—•]/gu, " ")));

const createUnicodeItineraryPdf = async (data, company) => {
    const pdf = new PDFDocument({ autoFirstPage: false, bufferPages: true,
        size: [WIDTH, HEIGHT], margin: 0 });
    pdf.info.Title = "Sri Lanka tour itinerary proposal";
    pdf.info.Author = company.companyName || "Dream Ceylon Journeys";
    const chunks = [];
    pdf.on("data", (chunk) => chunks.push(chunk));
    const output = new Promise((resolve, reject) => {
        pdf.on("end", () => resolve(Buffer.concat(chunks)));
        pdf.on("error", reject);
    });
    const text = createBriefText(pdf);
    let y;
    const addPage = () => {
        pdf.addPage();
        pdf.rect(0, 0, WIDTH, 98).fill("#f0fdfa");
        if (company.logoPath && fs.existsSync(company.logoPath)) {
            try { pdf.image(company.logoPath, MARGIN, 13, { fit: [90, 65] }); }
            catch { /* A damaged logo should not block the itinerary. */ }
        }
        const nameX = company.logoPath && fs.existsSync(company.logoPath) ? 147 : MARGIN;
        text.wrap(company.companyName || "Dream Ceylon Journeys", "bold", 14, WIDTH - nameX - MARGIN)
            .slice(0, 2).forEach((line, index) => text.draw(line, {
                x: nameX, y: 18 + 18 * index, size: 14, weight: "bold", color: green,
            }));
        text.draw("CUSTOM TOUR PROPOSAL", { x: nameX, y: 62, size: 11, weight: "bold", color: teal });
        pdf.rect(0, 95, WIDTH, 3).fill("#f59e0b");
        y = 119;
    };
    const ensureSpace = (height) => { if (y + height > SAFE_BOTTOM) addPage(); };
    const write = (value, { weight = "regular", size = 9, color = ink, indent = 0, lineHeight = 15 } = {}) => {
        for (const line of text.wrap(value, weight, size, CONTENT - indent)) {
            ensureSpace(lineHeight);
            text.draw(line, { x: MARGIN + indent, y, size, weight, color });
            y += lineHeight;
        }
    };
    const section = (label) => {
        ensureSpace(66);
        y += 12;
        pdf.rect(MARGIN, y, CONTENT, 25).fill(green);
        text.draw(label, { x: MARGIN + 10, y: y + 6, size: 10, weight: "bold", color: "#ffffff" });
        y += 35;
    };
    addPage();
    write("Suggested journey - please confirm availability and price before booking.", { color: teal, weight: "bold" });
    y += 8;
    section("Traveler and tour");
    for (const [label, value] of [
        ["Prepared for", data.clientName], ["Country", data.country],
        ["Travelers", data.travelers], ["Duration", data.durationDays && `${data.durationDays} days`],
        ["Travel style", data.travelStyle], ["Vehicle", data.vehicleType],
        ["Interests", data.interests], ["Destinations", data.preferredDestinations],
        ["Arrival", data.arrivalCity], ["Departure", data.endingPreference],
    ]) {
        if (value === undefined || value === null || value === "") continue;
        write(`${label}: ${Array.isArray(value) ? value.join(", ") : value}`, { size: 9.5 });
    }
    section("Suggested daily itinerary");
    const itineraryLines = String(data.generatedItinerary || "").split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
    for (const [index, line] of itineraryLines.entries()) {
        // Keep the final six entries together when their measured lines would
        // overflow, rather than leaving one day on an almost empty page.
        if (index === itineraryLines.length - 6) {
            const tailHeight = itineraryLines.slice(index).reduce((height, entry) => {
                const heading = /^day\s*\d+/iu.test(entry);
                const indent = /^[-*]\s/u.test(entry) ? 12 : 0;
                return height + (heading ? 9 : 2) +
                    text.wrap(entry, heading ? "bold" : "regular", heading ? 10 : 9, CONTENT - indent).length * 15;
            }, 0);
            if (y + tailHeight > SAFE_BOTTOM) addPage();
        }
        const day = /^day\s*\d+/iu.test(line);
        if (day) { ensureSpace(37); y += 6; }
        write(line, { weight: day ? "bold" : "regular", size: day ? 10 : 9,
            color: day ? green : ink, indent: /^[-*]\s/u.test(line) ? 12 : 0 });
        y += day ? 3 : 2;
    }
    if (!itineraryLines.length) write("No itinerary content provided.", { color: muted });

    const pages = pdf.bufferedPageRange().count;
    for (let index = 0; index < pages; index += 1) {
        pdf.switchToPage(index);
        pdf.moveTo(MARGIN, HEIGHT - 55).lineTo(WIDTH - MARGIN, HEIGHT - 55).strokeColor("#d1d5db").stroke();
        const mobiles = Array.isArray(company.mobiles) ? company.mobiles.join(" / ") : company.mobiles;
        const contact = [company.email, mobiles, company.website].filter(Boolean).join(" | ");
        text.draw(text.fit(contact || company.companyName, "regular", 7, CONTENT - 40), {
            x: MARGIN, y: HEIGHT - 43, size: 7, color: muted,
        });
        text.draw(`${index + 1} / ${pages}`, { x: WIDTH - MARGIN - 28, y: HEIGHT - 43, size: 7, color: muted });
    }
    pdf.end();
    return output;
};

module.exports = { needsUnicodeItineraryPdf, createUnicodeItineraryPdf };
