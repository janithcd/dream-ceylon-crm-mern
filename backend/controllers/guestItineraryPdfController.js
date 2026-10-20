const fs = require("node:fs");
const mongoose = require("mongoose");
const PDFDocument = require("pdfkit");
const Booking = require("../models/Booking");
const { getDocumentBrandConfig } = require("../utils/documentSettings");
const { formatDocumentDate } = require("../utils/documentDate");
const { buildGuestItinerary } = require("../utils/guestItinerary");
const { createBriefText } = require("../utils/briefPdfText");
const { createActivityLog } = require("../utils/createActivityLog");

const WIDTH = 595.28;
const HEIGHT = 841.89;
const MARGIN = 46;
const CONTENT_WIDTH = WIDTH - MARGIN * 2;
const green = "#0a6157";
const ink = "#1f2b33";
const muted = "#586874";
const pale = "#edf7f5";

const createGuestItineraryPdf = async (itinerary, company) => {
    const pdf = new PDFDocument({ autoFirstPage: false, bufferPages: true, size: [WIDTH, HEIGHT], margin: 0 });
    const chunks = [];
    pdf.on("data", (chunk) => chunks.push(chunk));
    const output = new Promise((resolve, reject) => {
        pdf.on("end", () => resolve(Buffer.concat(chunks)));
        pdf.on("error", reject);
    });
    const text = createBriefText(pdf);
    let y;

    const draw = (value, { size = 10, weight = "regular", color = ink, indent = 0, lineHeight = 16 } = {}) => {
        for (const line of text.wrap(value, weight, size, CONTENT_WIDTH - indent)) {
            if (y + lineHeight > HEIGHT - 72) addPage();
            text.draw(line, { x: MARGIN + indent, y, size, weight, color });
            y += lineHeight;
        }
    };

    const addPage = () => {
        pdf.addPage();
        pdf.rect(0, 0, WIDTH, 145).fill(pale);
        if (company.logoPath && fs.existsSync(company.logoPath)) {
            try {
                pdf.image(company.logoPath, WIDTH - MARGIN - 95, 17, { fit: [95, 65] });
            } catch {
                // An invalid custom logo must not prevent guests receiving their itinerary.
            }
        }
        const brandLines = text.wrap(company.companyName || "Dream Ceylon Journeys", "bold", 15, CONTENT_WIDTH - 110);
        brandLines.slice(0, 2).forEach((line, index) => {
            text.draw(line, { x: MARGIN, y: 22 + index * 20, size: 15, weight: "bold", color: green });
        });
        text.draw("YOUR SRI LANKA ITINERARY", { x: MARGIN, y: 88, size: 17, weight: "bold", color: ink });
        text.draw(`${itinerary.bookingCode}${itinerary.isDraft ? " | DRAFT" : ""}`, {
            x: MARGIN, y: 116, size: 9, color: muted,
        });
        y = 163;
    };

    addPage();
    draw(`Prepared for ${itinerary.guestName}`, { size: 13, weight: "bold", lineHeight: 21 });
    draw(`Travel dates: ${formatDocumentDate(itinerary.travelStartDate)} to ${formatDocumentDate(itinerary.travelEndDate)}`, { color: muted });
    draw(`Travelers: ${itinerary.numberOfTravelers}`, { color: muted });
    if (itinerary.isDraft) {
        y += 6;
        draw("Draft itinerary - arrangements may change until your booking is confirmed.", { color: green });
    }
    y += 15;

    let lastDate = "";
    for (const entry of itinerary.entries) {
        const day = formatDocumentDate(entry.date);
        if (day !== lastDate) {
            if (y + 65 > HEIGHT - 72) addPage();
            y += 9;
            pdf.rect(MARGIN, y, CONTENT_WIDTH, 27).fill(pale);
            text.draw(day, { x: MARGIN + 10, y: y + 7, size: 11, weight: "bold", color: green });
            y += 37;
            lastDate = day;
        }
        if (y + 45 > HEIGHT - 72) addPage();
        draw(entry.title, { size: 11, weight: "bold", lineHeight: 19 });
        if (entry.plan) draw(entry.plan, { indent: 10, lineHeight: 15 });
        if (entry.overnightLocation) draw(`Overnight: ${entry.overnightLocation}`, { indent: 10, color: muted });
        y += 15;
    }

    const contact = [
        company.whatsapp && `WhatsApp: ${company.whatsapp}`,
        company.email && `Email: ${company.email}`,
        company.website && `Website: ${company.website}`,
    ].filter(Boolean);
    const pageCount = pdf.bufferedPageRange().count;
    for (let index = 0; index < pageCount; index += 1) {
        pdf.switchToPage(index);
        pdf.moveTo(MARGIN, HEIGHT - 63).lineTo(WIDTH - MARGIN, HEIGHT - 63).strokeColor(pale).stroke();
        const contactText = contact.join(" | ");
        const contactLines = text.wrap(contactText || company.companyName || "Dream Ceylon Journeys", "regular", 8, CONTENT_WIDTH - 32);
        contactLines.slice(0, 2).forEach((line, lineIndex) => {
            text.draw(line, { x: MARGIN, y: HEIGHT - 55 + lineIndex * 11, size: 8, color: muted });
        });
        text.draw(`${index + 1} / ${pageCount}`, { x: WIDTH - MARGIN - 26, y: HEIGHT - 53, size: 8, color: muted });
    }

    pdf.end();
    return output;
};

const generateGuestItineraryPdf = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: "Invalid booking ID" });
        }
        const booking = await Booking.findById(req.params.id);
        if (!booking) return res.status(404).json({ message: "Booking not found" });
        if (booking.bookingStatus === "Cancelled") {
            return res.status(409).json({ message: "Cancelled bookings cannot have a guest itinerary" });
        }
        if (!booking.itineraryDays?.length) {
            return res.status(409).json({ message: "Add itinerary entries before downloading the guest PDF" });
        }

        const itinerary = buildGuestItinerary(booking);
        const company = await getDocumentBrandConfig();
        const bytes = await createGuestItineraryPdf(itinerary, company);
        const safeCode = String(booking.bookingCode || "booking").replace(/[^a-zA-Z0-9-]/g, "-");
        const filename = `dream-ceylon-guest-itinerary-${safeCode}.pdf`;

        await createActivityLog({
            req, action: "GENERATE", module: "PDF",
            description: `Guest itinerary generated for booking ${booking.bookingCode}`,
            relatedRecordId: booking._id, relatedModel: "Booking",
            referenceNo: booking.bookingCode, customerName: booking.customer?.fullName,
            metadata: { documentType: "Guest Itinerary", filename },
        });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("Cache-Control", "no-store");
        return res.send(Buffer.from(bytes));
    } catch (error) {
        console.error("Guest itinerary generation failed:", error.message);
        return res.status(500).json({ message: "Failed to generate guest itinerary PDF" });
    }
};

module.exports = { createGuestItineraryPdf, generateGuestItineraryPdf };
