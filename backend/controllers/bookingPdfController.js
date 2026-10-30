const fs = require("node:fs");
const mongoose = require("mongoose");
const PDFDocument = require("pdfkit");
const Booking = require("../models/Booking");
const defaultBrandConfig = require("../config/brandConfig");
const { getDocumentBrandConfig } = require("../utils/documentSettings");
const { formatDocumentDate } = require("../utils/documentDate");
const { createBriefText } = require("../utils/briefPdfText");
const { createActivityLog } = require("../utils/createActivityLog");

const WIDTH = 595.28;
const HEIGHT = 841.89;
const MARGIN = 45;
const CONTENT = WIDTH - MARGIN * 2;
const green = "#0a6157";
const ink = "#1f2b33";
const muted = "#586874";
const pale = "#edf7f5";

const money = (amount, currency) => `${currency} ${Number(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
})}`;

const createInvoicePdf = async (booking, company = defaultBrandConfig, issuedAt = new Date()) => {
    const pdf = new PDFDocument({ autoFirstPage: false, bufferPages: true,
        size: [WIDTH, HEIGHT], margin: 0 });
    pdf.info.Title = `Booking invoice INV-${booking.bookingCode}`;
    const chunks = [];
    pdf.on("data", (chunk) => chunks.push(chunk));
    const output = new Promise((resolve, reject) => {
        pdf.on("end", () => resolve(Buffer.concat(chunks)));
        pdf.on("error", reject);
    });
    const text = createBriefText(pdf);
    const draw = (value, x, top, size = 9, weight = "regular", color = ink) =>
        text.draw(value, { x, y: top, size, weight, color });
    let y = 0;

    const addPage = () => {
        pdf.addPage();
        pdf.rect(0, 0, WIDTH, 125).fill(pale);
        if (company.logoPath && fs.existsSync(company.logoPath)) {
            try { pdf.image(company.logoPath, WIDTH - MARGIN - 140, 11, { fit: [140, 82] }); }
            catch { /* An invalid logo must not block a guest invoice. */ }
        }
        text.wrap(company.companyName || "Dream Ceylon Journeys", "bold", 14, CONTENT - 110)
            .slice(0, 2).forEach((line, index) => draw(line, MARGIN, 18 + index * 18, 14, "bold", green));
        draw("BOOKING INVOICE", MARGIN, 64, 17, "bold");
        draw(`INV-${booking.bookingCode} | Issued ${formatDocumentDate(issuedAt)}`, MARGIN, 91, 8, "regular", muted);
        y = 144;
    };
    const ensureSpace = (height) => { if (y + height > HEIGHT - 76) addPage(); };
    const section = (title) => {
        ensureSpace(50);
        y += 9;
        pdf.rect(MARGIN, y, CONTENT, 25).fill(pale);
        draw(title, MARGIN + 9, y + 6, 10, "bold", green);
        y += 36;
    };
    const detail = (label, value) => {
        const lines = text.wrap(value, "bold", 9, CONTENT - 165);
        ensureSpace(lines.length * 16 + 6);
        draw(label, MARGIN, y, 9, "regular", muted);
        for (const line of lines) {
            draw(line, MARGIN + 165, y, 9, "bold");
            y += 16;
        }
        y += 5;
    };
    const paragraph = (value, color = ink) => {
        for (const line of text.wrap(value, "regular", 9, CONTENT)) {
            ensureSpace(15);
            draw(line, MARGIN, y, 9, "regular", color);
            y += 15;
        }
    };

    addPage();
    section("CLIENT");
    detail("Lead guest", booking.customer?.fullName);
    detail("Email", booking.customer?.email);
    detail("WhatsApp", booking.customer?.whatsappNumber);
    detail("Country", booking.customer?.country);

    section("BOOKING");
    detail("Reference", booking.bookingCode);
    detail("Package", booking.selectedPackage?.title || "Custom private tour");
    detail("Travel dates", `${formatDocumentDate(booking.travelStartDate)} to ${formatDocumentDate(booking.travelEndDate)}`);
    detail("Travelers", String(booking.numberOfTravelers || 0));
    detail("Vehicle", booking.vehicleType);
    detail("Booking status", booking.bookingStatus || "Pending");

    section("BOOKING PRICE AND TARGETS");
    detail("Tour price", money(booking.totalPrice, booking.currency));
    if (Number(booking.hotelAdvanceAmount) > 0) {
        detail("Hotel advance target", money(booking.hotelAdvanceAmount, booking.currency));
        detail("Target date", formatDocumentDate(booking.hotelAdvanceDueDate, { fallback: "Not scheduled" }));
    }
    detail("Final due date", formatDocumentDate(booking.paymentDueDate, { fallback: "Not scheduled" }));

    section("PAYMENT INSTRUCTIONS");
    paragraph(company.pdfSettings?.paymentInstructions ||
        "Please quote the booking number when making a payment.");
    y += 10;
    paragraph("This invoice shows the booked price and agreed targets. It does not reflect payments already recorded. Check the guest payment statement for your current balance before paying.", muted);

    const count = pdf.bufferedPageRange().count;
    for (let index = 0; index < count; index += 1) {
        pdf.switchToPage(index);
        pdf.moveTo(MARGIN, HEIGHT - 61).lineTo(WIDTH - MARGIN, HEIGHT - 61).strokeColor(pale).stroke();
        draw(company.pdfSettings?.footerText || "Thank you for choosing Dream Ceylon Journeys.",
            MARGIN, HEIGHT - 48, 8, "regular", muted);
        const contact = [company.address, company.mobiles?.[0], company.email, company.website]
            .filter(Boolean).join(" | ");
        if (contact) text.wrap(contact, "regular", 7, CONTENT - 35)
            .slice(0, 2).forEach((line, lineIndex) =>
                draw(line, MARGIN, HEIGHT - 35 + lineIndex * 9, 7, "regular", muted));
        draw(`${index + 1} / ${count}`, WIDTH - MARGIN - 27, HEIGHT - 48, 8, "regular", muted);
    }
    pdf.end();
    return output;
};

const generateBookingInvoicePdf = async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: "Invalid booking ID" });
    }
    try {
        const booking = await Booking.findById(req.params.id)
            .select("bookingCode bookingStatus customer selectedPackage travelStartDate travelEndDate numberOfTravelers vehicleType totalPrice currency hotelAdvanceAmount hotelAdvanceDueDate paymentDueDate")
            .populate("selectedPackage", "title");
        if (!booking) return res.status(404).json({ message: "Booking not found" });
        if (booking.bookingStatus === "Cancelled" ||
            !Number.isFinite(booking.totalPrice) || booking.totalPrice <= 0 ||
            Math.abs(booking.totalPrice * 100 - Math.round(booking.totalPrice * 100)) > 0.000001 ||
            !["USD", "LKR", "EUR", "GBP"].includes(booking.currency)) {
            return res.status(409).json({ message: "Review the booking status, currency and price before issuing an invoice." });
        }
        const company = await getDocumentBrandConfig();
        const pdfBytes = await createInvoicePdf(booking, company);
        const fileName = `dream-ceylon-invoice-${booking.bookingCode}.pdf`;
        await createActivityLog({
            req, action: "GENERATE", module: "PDF",
            description: `Booking invoice was generated for ${booking.bookingCode}`,
            relatedRecordId: booking._id, relatedModel: "Booking",
            referenceNo: booking.bookingCode, customerName: booking.customer?.fullName,
            metadata: { documentType: "Booking Invoice", filename: fileName,
                totalPrice: booking.totalPrice, currency: booking.currency,
                bookingStatus: booking.bookingStatus },
        });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
        return res.send(pdfBytes);
    } catch (error) {
        console.error("Booking invoice generation failed:", error.message);
        return res.status(500).json({ message: "Failed to generate booking invoice PDF" });
    }
};

const generateBookingReceiptPdf = (req, res) => {
    res.set("Cache-Control", "no-store");
    return res.status(410).json({
        message: "The booking-level receipt is retired. Open the booking's Payments panel to download a receipt for a recorded payment, or a guest payment statement for the full balance.",
    });
};

module.exports = { generateBookingInvoicePdf, generateBookingReceiptPdf, createInvoicePdf };
