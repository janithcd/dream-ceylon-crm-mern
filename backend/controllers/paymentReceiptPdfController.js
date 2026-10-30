const fs = require("node:fs");
const mongoose = require("mongoose");
const PDFDocument = require("pdfkit");
const BookingPayment = require("../models/BookingPayment");
const defaultBrandConfig = require("../config/brandConfig");
const { getDocumentBrandConfig } = require("../utils/documentSettings");
const { formatDocumentDate } = require("../utils/documentDate");
const { getBusinessDayBounds } = require("../utils/businessDate");
const { createBriefText } = require("../utils/briefPdfText");
const { createActivityLog } = require("../utils/createActivityLog");

const WIDTH = 595.28;
const HEIGHT = 841.89;
const MARGIN = 45;
const CONTENT = WIDTH - 2 * MARGIN;
const green = "#0a6157";
const ink = "#1f2b33";
const muted = "#586874";
const pale = "#edf7f5";

// Older records can predate the payment integrity checks. Do not produce a
// guest-facing confirmation for an impossible amount, date, or currency.
const paymentDocumentIssue = (payment, issuedAt = new Date()) => {
    if (payment.status === "Cancelled") return "Cancelled entries cannot generate payment documents.";
    if (!["Received", "Refunded"].includes(payment.status) ||
        (payment.status === "Refunded") !== (payment.paymentType === "Refund")) {
        return "Review the payment type and status before generating a document.";
    }
    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || amount <= 0 ||
        Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) {
        return "Review the payment amount before generating a document.";
    }
    if (!["USD", "LKR", "EUR", "GBP"].includes(payment.currency) ||
        payment.currency !== payment.booking?.currency) {
        return "Correct this payment to the verified booking currency before generating a document.";
    }
    const date = payment.paymentDate && new Date(payment.paymentDate);
    if (!date || Number.isNaN(date.getTime()) ||
        getBusinessDayBounds(date).start > getBusinessDayBounds(issuedAt).end) {
        return "Review the payment date before generating a document.";
    }
    return null;
};

const createPaymentReceiptPdf = async (payment, company = defaultBrandConfig, issuedAt = new Date()) => {
    const isRefund = payment.status === "Refunded";
    const title = isRefund ? "REFUND CONFIRMATION" : "PAYMENT RECEIPT";
    const pdf = new PDFDocument({ autoFirstPage: false, bufferPages: true,
        size: [WIDTH, HEIGHT], margin: 0 });
    pdf.info.Title = `${title} ${payment.paymentNo}`;
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
    let currentSection = "";
    const addPage = () => {
        pdf.addPage();
        pdf.rect(0, 0, WIDTH, 119).fill(pale);
        if (company.logoPath && fs.existsSync(company.logoPath)) {
            try { pdf.image(company.logoPath, WIDTH - MARGIN - 126, 12, { fit: [126, 76] }); }
            catch { /* A missing or invalid logo must not block a payment document. */ }
        }
        text.wrap(company.companyName || "Dream Ceylon Journeys", "bold", 14, CONTENT - 142)
            .slice(0, 2).forEach((part, index) => draw(part, MARGIN, 17 + index * 17, 14, "bold", green));
        draw(title, MARGIN, 62, 17, "bold", green);
        draw(`Issued ${formatDocumentDate(issuedAt)}`, MARGIN, 91, 8, "regular", muted);
        y = 137;
    };
    const ensureSpace = (height) => { if (y + height > HEIGHT - 85) addPage(); };
    const section = (label, continuation = false) => {
        ensureSpace(47);
        if (!continuation) currentSection = label;
        y += 9;
        pdf.rect(MARGIN, y, CONTENT, 25).fill(pale);
        draw(label, MARGIN + 9, y + 6, 10, "bold", green);
        y += 35;
    };
    const detail = (label, value) => {
        const lines = text.wrap(value || "-", "bold", 9, CONTENT - 155);
        ensureSpace(17);
        draw(label, MARGIN, y, 9, "regular", muted);
        for (const part of lines) {
            if (y + 17 > HEIGHT - 85) {
                addPage();
                section(`${currentSection} (CONTINUED)`, true);
                draw(`${label} (continued)`, MARGIN, y, 9, "regular", muted);
            }
            draw(part, MARGIN + 155, y, 9, "bold");
            y += 16;
        }
        y += 4;
    };

    addPage();
    section(isRefund ? "REFUNDED TO" : "RECEIVED FROM");
    detail("Lead guest", payment.booking.customer?.fullName);
    detail("Email", payment.booking.customer?.email);
    detail("Booking reference", payment.booking.bookingCode);

    ensureSpace(112);
    y += 9;
    pdf.rect(MARGIN, y, CONTENT, 91).fill(pale);
    draw(isRefund ? "Refund Amount" : "Payment Received", MARGIN + 15, y + 13, 11, "bold", green);
    draw(`${payment.currency} ${Number(payment.amount).toLocaleString("en-US", {
        minimumFractionDigits: 2, maximumFractionDigits: 2,
    })}`, MARGIN + 15, y + 38, 25, "bold", green);
    y += 105;

    section(isRefund ? "REFUND DETAILS" : "PAYMENT DETAILS");
    detail("Record number", payment.paymentNo);
    detail("Date", formatDocumentDate(payment.paymentDate));
    detail("Type", payment.paymentType);
    detail("Method", payment.paymentMethod);
    detail("Reference", payment.referenceNumber);
    y += 10;
    for (const line of text.wrap(isRefund
        ? "This confirmation records the refund shown above. Please keep it for your records."
        : "This receipt confirms the payment received for the above booking. Please keep it for your records.",
    "regular", 9, CONTENT)) {
        ensureSpace(15);
        draw(line, MARGIN, y, 9, "regular", muted);
        y += 15;
    }
    // Payment notes are private staff context. A running booking balance belongs
    // on the separately validated guest payment statement, not on one receipt.
    const count = pdf.bufferedPageRange().count;
    for (let index = 0; index < count; index += 1) {
        pdf.switchToPage(index);
        pdf.moveTo(MARGIN, HEIGHT - 70).lineTo(WIDTH - MARGIN, HEIGHT - 70).strokeColor(pale).stroke();
        const contact = [company.address, company.mobiles?.[0], company.email, company.website]
            .filter(Boolean).join(" | ");
        text.wrap(contact || company.companyName || "Dream Ceylon Journeys", "regular", 7, CONTENT - 40)
            .slice(0, 2).forEach((line, lineIndex) =>
                draw(line, MARGIN, HEIGHT - 55 + lineIndex * 10, 7, "regular", muted));
        draw(`${index + 1} / ${count}`, WIDTH - MARGIN - 31, HEIGHT - 55, 8, "regular", muted);
    }
    pdf.end();
    return output;
};

const getPaymentById = (paymentId) => BookingPayment.findById(paymentId).populate({
    path: "booking",
    select: "bookingCode customer currency",
});

const generateSinglePaymentReceiptPdf = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: "Invalid payment ID" });
        }
        const payment = await getPaymentById(req.params.id);
        if (!payment) return res.status(404).json({ message: "Payment not found" });
        if (!payment.booking) return res.status(404).json({ message: "Booking not found for this payment" });
        const issue = paymentDocumentIssue(payment);
        if (issue) return res.status(409).json({ message: issue });

        const company = await getDocumentBrandConfig();
        const pdfBytes = await createPaymentReceiptPdf(payment, company);
        const isRefund = payment.status === "Refunded";
        const documentType = isRefund ? "Refund Confirmation" : "Payment Receipt";
        const safePaymentNo = String(payment.paymentNo).replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 80);
        const fileName = `dream-ceylon-${isRefund ? "refund-confirmation" : "payment-receipt"}-${safePaymentNo}.pdf`;
        await createActivityLog({
            req, action: "GENERATE", module: "PDF",
            description: `${documentType} ${payment.paymentNo} was generated`,
            relatedRecordId: payment._id, relatedModel: "BookingPayment",
            referenceNo: payment.paymentNo, customerName: payment.booking.customer?.fullName,
            metadata: { documentType, filename: fileName,
                bookingCode: payment.booking.bookingCode, amount: payment.amount,
                currency: payment.currency, paymentType: payment.paymentType,
                paymentMethod: payment.paymentMethod, paymentStatus: payment.status },
        });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
        return res.send(pdfBytes);
    } catch (error) {
        console.error("Payment document generation failed:", error.message);
        await createActivityLog({
            req, action: "GENERATE", module: "PDF",
            description: `Payment document generation failed for payment ${req.params.id}`,
            relatedRecordId: req.params.id, relatedModel: "BookingPayment",
            referenceNo: req.params.id, status: "Failed",
            metadata: { documentType: "Payment Receipt", error: error.message },
        });
        return res.status(500).json({ message: "Failed to generate payment document PDF" });
    }
};

module.exports = { generateSinglePaymentReceiptPdf, createPaymentReceiptPdf, paymentDocumentIssue };
