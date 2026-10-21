const fs = require("node:fs");
const mongoose = require("mongoose");
const PDFDocument = require("pdfkit");
const Booking = require("../models/Booking");
const { getDocumentBrandConfig } = require("../utils/documentSettings");
const { formatDocumentDate } = require("../utils/documentDate");
const { buildHotelVoucher } = require("../utils/hotelVoucher");
const { createBriefText } = require("../utils/briefPdfText");
const { createActivityLog } = require("../utils/createActivityLog");

const WIDTH = 595.28;
const HEIGHT = 841.89;
const MARGIN = 46;
const CONTENT_WIDTH = WIDTH - 2 * MARGIN;
const green = "#0a6157";
const ink = "#1f2b33";
const muted = "#586874";
const pale = "#edf7f5";

const createHotelVoucherPdf = async (voucher, company) => {
    const pdf = new PDFDocument({ autoFirstPage: false, bufferPages: true, size: [WIDTH, HEIGHT], margin: 0 });
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
        pdf.rect(0, 0, WIDTH, 145).fill(pale);
        if (company.logoPath && fs.existsSync(company.logoPath)) {
            try {
                pdf.image(company.logoPath, WIDTH - MARGIN - 95, 17, { fit: [95, 65] });
            } catch {
                // A missing or invalid logo must not prevent a voucher download.
            }
        }
        const brandLines = text.wrap(company.companyName || "Dream Ceylon Journeys", "bold", 15, CONTENT_WIDTH - 110);
        brandLines.slice(0, 2).forEach((line, index) => {
            text.draw(line, { x: MARGIN, y: 22 + index * 20, size: 15, weight: "bold", color: green });
        });
        text.draw("HOTEL VOUCHER", { x: MARGIN, y: 88, size: 19, weight: "bold", color: ink });
        text.draw("CONFIRMED RESERVATION", { x: MARGIN, y: 118, size: 9, weight: "bold", color: green });
        y = 166;
    };
    const ensureSpace = (height) => { if (y + height > HEIGHT - 75) addPage(); };
    const draw = (value, { size = 10, weight = "regular", color = ink, lineHeight = 16 } = {}) => {
        for (const line of text.wrap(value, weight, size, CONTENT_WIDTH)) {
            ensureSpace(lineHeight);
            text.draw(line, { x: MARGIN, y, size, weight, color });
            y += lineHeight;
        }
    };
    const section = (title) => {
        ensureSpace(65);
        y += 12;
        pdf.rect(MARGIN, y, CONTENT_WIDTH, 26).fill(pale);
        text.draw(title, { x: MARGIN + 10, y: y + 6, size: 10, weight: "bold", color: green });
        y += 38;
    };
    const detail = (label, value) => {
        const lines = text.wrap(value || "Not supplied", "regular", 10, CONTENT_WIDTH - 133);
        ensureSpace(Math.min(lines.length * 16 + 10, 120));
        text.draw(label, { x: MARGIN, y, size: 9, color: muted });
        for (const line of lines) {
            ensureSpace(16);
            text.draw(line, { x: MARGIN + 133, y, size: 10, color: ink });
            y += 16;
        }
        y += 8;
    };

    addPage();
    draw(voucher.hotelName, { size: 17, weight: "bold", lineHeight: 24 });
    if (voucher.location) draw(voucher.location, { color: muted });
    section("RESERVATION DETAILS");
    detail("Lead guest", voucher.guestName);
    detail("Booking reference", voucher.bookingCode);
    detail("Hotel reference", voucher.confirmationNumber);
    detail("Issued on", formatDocumentDate(voucher.issuedAt));
    section("YOUR STAY");
    detail("Check-in date", formatDocumentDate(voucher.checkInDate));
    detail("Check-out date", formatDocumentDate(voucher.checkOutDate));
    detail("Nights", String(voucher.nights));
    detail("Rooms", String(voucher.rooms));
    detail("Room type", voucher.roomType);
    detail("Meal plan", voucher.mealPlan);
    y += 7;
    draw("Please present this voucher at check-in. Dates are in Sri Lanka time; hotel check-in and check-out times apply.", { size: 9, color: muted, lineHeight: 14 });
    draw("This voucher records the saved reservation details and is not a payment receipt.", { size: 9, color: muted, lineHeight: 14 });
    section("BOOKING ASSISTANCE");
    if (company.whatsapp) draw(`WhatsApp: ${company.whatsapp}`, { size: 9, lineHeight: 15 });
    if (company.email) draw(`Email: ${company.email}`, { size: 9, lineHeight: 15 });
    if (company.website) draw(`Website: ${company.website}`, { size: 9, lineHeight: 15 });

    const pageCount = pdf.bufferedPageRange().count;
    for (let index = 0; index < pageCount; index += 1) {
        pdf.switchToPage(index);
        pdf.moveTo(MARGIN, HEIGHT - 58).lineTo(WIDTH - MARGIN, HEIGHT - 58).strokeColor(pale).stroke();
        text.draw("Hotel voucher | Keep a copy for your arrival", { x: MARGIN, y: HEIGHT - 47, size: 8, color: muted });
        text.draw(`${index + 1} / ${pageCount}`, { x: WIDTH - MARGIN - 26, y: HEIGHT - 47, size: 8, color: muted });
    }
    pdf.end();
    return output;
};

const generateHotelVoucherPdf = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id) || !mongoose.Types.ObjectId.isValid(req.params.stayId)) {
            return res.status(400).json({ message: "Invalid booking or hotel stay ID" });
        }
        const booking = await Booking.findById(req.params.id);
        if (!booking) return res.status(404).json({ message: "Booking not found" });
        const stay = booking.hotelStays.id(req.params.stayId);
        if (!stay) return res.status(404).json({ message: "Hotel stay not found in this booking" });
        const result = buildHotelVoucher(booking, stay);
        if (result.error) return res.status(409).json({ message: result.error });

        const company = await getDocumentBrandConfig();
        const bytes = await createHotelVoucherPdf(result.value, company);
        const safeCode = String(booking.bookingCode || "booking").replace(/[^a-zA-Z0-9-]/g, "-");
        const filename = `dream-ceylon-hotel-voucher-${safeCode}-${stay._id}.pdf`;
        await createActivityLog({
            req, action: "GENERATE", module: "PDF",
            description: `Hotel voucher generated for ${stay.hotelName} on booking ${booking.bookingCode}`,
            relatedRecordId: booking._id, relatedModel: "Booking",
            referenceNo: booking.bookingCode, customerName: booking.customer?.fullName,
            metadata: { documentType: "Hotel Voucher", stayId: String(stay._id), filename },
        });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("Cache-Control", "no-store");
        return res.send(Buffer.from(bytes));
    } catch (error) {
        console.error("Hotel voucher generation failed:", error.message);
        return res.status(500).json({ message: "Failed to generate hotel voucher PDF" });
    }
};

module.exports = { createHotelVoucherPdf, generateHotelVoucherPdf };
