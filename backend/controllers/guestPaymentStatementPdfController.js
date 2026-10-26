const fs = require("node:fs");
const mongoose = require("mongoose");
const PDFDocument = require("pdfkit");
const Booking = require("../models/Booking");
const BookingPayment = require("../models/BookingPayment");
const { getDocumentBrandConfig } = require("../utils/documentSettings");
const { formatDocumentDate } = require("../utils/documentDate");
const { buildGuestPaymentStatement } = require("../utils/guestPaymentStatement");
const { acquireBookingPaymentLocks } = require("../utils/bookingPaymentLock");
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

const money = (amount, currency) => `${currency} ${(amount / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
})}`;

const createGuestPaymentStatementPdf = async (statement, company) => {
    const pdf = new PDFDocument({ autoFirstPage: false, bufferPages: true,
        size: [WIDTH, HEIGHT], margin: 0 });
    const chunks = [];
    pdf.on("data", (chunk) => chunks.push(chunk));
    const output = new Promise((resolve, reject) => {
        pdf.on("end", () => resolve(Buffer.concat(chunks)));
        pdf.on("error", reject);
    });
    const text = createBriefText(pdf);
    let y = 0;
    const draw = (value, x, top, size = 9, weight = "regular", color = ink) =>
        text.draw(value, { x, y: top, size, weight, color });

    const addPage = () => {
        pdf.addPage();
        pdf.rect(0, 0, WIDTH, 112).fill(pale);
        if (company.logoPath && fs.existsSync(company.logoPath)) {
            try { pdf.image(company.logoPath, WIDTH - MARGIN - 85, 17, { fit: [85, 53] }); }
            catch { /* A missing or invalid logo must not block a statement. */ }
        }
        text.wrap(company.companyName || "Dream Ceylon Journeys", "bold", 14, CONTENT - 100)
            .slice(0, 2).forEach((line, index) => draw(line, MARGIN, 21 + index * 18, 14, "bold", green));
        draw("GUEST PAYMENT STATEMENT", MARGIN, 60, 17, "bold");
        draw(`${statement.bookingCode} | Issued ${formatDocumentDate(statement.issuedAt)}`, MARGIN, 87, 8, "regular", muted);
        y = 133;
    };
    const ensureSpace = (height) => { if (y + height > HEIGHT - 67) addPage(); };
    const line = (value, { size = 9, weight = "regular", color = ink, lineHeight = 14 } = {}) => {
        for (const part of text.wrap(value, weight, size, CONTENT)) {
            ensureSpace(lineHeight);
            draw(part, MARGIN, y, size, weight, color);
            y += lineHeight;
        }
    };
    const section = (title) => {
        ensureSpace(50);
        y += 12;
        pdf.rect(MARGIN, y, CONTENT, 25).fill(pale);
        draw(title, MARGIN + 9, y + 6, 10, "bold", green);
        y += 35;
    };
    const detail = (label, value) => {
        ensureSpace(23);
        draw(label, MARGIN, y, 9, "regular", muted);
        const parts = text.wrap(value, "bold", 9, CONTENT - 160);
        for (const part of parts) {
            ensureSpace(16);
            draw(part, MARGIN + 160, y, 9, "bold");
            y += 16;
        }
        y += 3;
    };
    const tableHeading = () => {
        ensureSpace(33);
        pdf.rect(MARGIN, y, CONTENT, 24).fill(pale);
        draw("Date", MARGIN + 6, y + 6, 8, "bold", green);
        draw("Record", MARGIN + 94, y + 6, 8, "bold", green);
        draw("Type", MARGIN + 220, y + 6, 8, "bold", green);
        draw("Method", MARGIN + 288, y + 6, 8, "bold", green);
        draw("Amount", MARGIN + 405, y + 6, 8, "bold", green);
        y += 29;
    };

    addPage();
    line("This statement reflects recorded guest payments as of the issue date. It is not a request to pay twice.", { color: muted });
    section("BOOKING");
    detail("Lead guest", statement.guestName);
    detail("Booking reference", statement.bookingCode);
    detail("Travel dates", `${formatDocumentDate(statement.travelStartDate)} to ${formatDocumentDate(statement.travelEndDate)}`);
    detail("Booking status", statement.bookingStatus);
    section("BALANCE SUMMARY");
    detail("Tour price", money(statement.totalCents, statement.currency));
    detail("Payments received", money(statement.receivedCents, statement.currency));
    detail("Refunds recorded", money(statement.refundedCents, statement.currency));
    detail("Net paid", money(statement.netPaidCents, statement.currency));
    detail("Remaining balance", money(statement.balanceCents, statement.currency));
    if (statement.creditCents > 0) detail("Credit to guest", money(statement.creditCents, statement.currency));
    if (statement.hotelAdvanceCents > 0) {
        section("HOTEL ADVANCE TARGET");
        detail("Agreed advance", money(statement.hotelAdvanceCents, statement.currency));
        detail("Still to collect", money(statement.hotelAdvanceOutstandingCents, statement.currency));
        detail("Due date", formatDocumentDate(statement.hotelAdvanceDueDate, { fallback: "Not scheduled" }));
        line("The hotel advance is part of the remaining booking balance shown above.", { color: muted });
        y += 8;
    }
    if (statement.balanceCents > 0) {
        detail("Final balance due", formatDocumentDate(statement.finalDueDate, { fallback: "Not scheduled" }));
    }
    section("RECORDED RECEIPTS AND REFUNDS");
    if (statement.rows.length === 0) line("No payments have been recorded for this booking.", { color: muted });
    else {
        tableHeading();
        for (const row of statement.rows) {
            const recordLines = text.wrap(row.paymentNo, "regular", 8, 122);
            const methodLines = text.wrap(row.method || "-", "regular", 8, 112);
            const amountLines = text.wrap(`${row.kind === "Refund" ? "-" : "+"} ${money(row.amountCents, statement.currency)}`, "bold", 8, 99);
            const referenceLines = row.reference ? text.wrap(`Reference: ${row.reference}`, "regular", 8, CONTENT - 14) : [];
            const height = Math.max(recordLines.length, methodLines.length, amountLines.length, 1) * 13 +
                referenceLines.length * 12 + 10;
            if (y + height > HEIGHT - 67) {
                addPage();
                tableHeading();
            }
            const top = y;
            draw(formatDocumentDate(row.date), MARGIN + 6, top, 8);
            recordLines.forEach((part, index) => draw(part, MARGIN + 94, top + index * 13, 8));
            draw(row.kind, MARGIN + 220, top, 8);
            methodLines.forEach((part, index) => draw(part, MARGIN + 288, top + index * 13, 8));
            amountLines.forEach((part, index) => draw(part, MARGIN + 405, top + index * 13, 8, "bold"));
            y += Math.max(recordLines.length, methodLines.length, amountLines.length, 1) * 13;
            referenceLines.forEach((part) => { draw(part, MARGIN + 6, y, 8, "regular", muted); y += 12; });
            y += 10;
            pdf.moveTo(MARGIN, y - 3).lineTo(WIDTH - MARGIN, y - 3).strokeColor(pale).stroke();
        }
    }
    y += 14;
    line("Questions about a payment? Contact us using the details below and quote your booking reference.", { color: muted });
    if (company.email) line(`Email: ${company.email}`, { color: muted });
    if (company.whatsapp) line(`WhatsApp: ${company.whatsapp}`, { color: muted });

    const count = pdf.bufferedPageRange().count;
    for (let index = 0; index < count; index += 1) {
        pdf.switchToPage(index);
        pdf.moveTo(MARGIN, HEIGHT - 57).lineTo(WIDTH - MARGIN, HEIGHT - 57).strokeColor(pale).stroke();
        draw("Guest payment statement | All amounts in the booking currency", MARGIN, HEIGHT - 44, 8, "regular", muted);
        draw(`${index + 1} / ${count}`, WIDTH - MARGIN - 30, HEIGHT - 44, 8, "regular", muted);
    }
    pdf.end();
    return output;
};

const readGuestPaymentStatementSnapshot = async (bookingId) => {
    let release = null;
    try {
        release = await acquireBookingPaymentLocks([bookingId]);
        const booking = await Booking.findById(bookingId);
        if (!booking) return { status: 404, message: "Booking not found" };
        const payments = await BookingPayment.find({ booking: booking._id })
            .sort({ paymentDate: 1, _id: 1 }).limit(1001).lean();
        if (payments.length > 1000) {
            return { status: 413, message: "This booking has more than 1,000 payment records. Contact Finance for an export." };
        }
        const checkedAt = new Date();
        return { result: buildGuestPaymentStatement(booking, payments, checkedAt), checkedAt };
    } finally {
        if (release) await release();
    }
};

const getGuestPaymentStatementReadiness = async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: "Invalid booking ID" });
    }
    try {
        const snapshot = await readGuestPaymentStatementSnapshot(req.params.id);
        if (snapshot.status === 404) return res.status(404).json({ message: snapshot.message });
        if (snapshot.status === 413) return res.json({ ready: false, checkedAt: new Date(),
            issues: [{ code: "too_many_payments", message: snapshot.message, paymentNo: null, paymentDate: null }] });
        return res.json({ ready: !snapshot.result.error, issues: snapshot.result.issues,
            checkedAt: snapshot.checkedAt });
    } catch (error) {
        console.error("Payment statement readiness failed:", error.message);
        return res.status(error.code === "PAYMENT_WRITE_BUSY" ? 409 : 500).json({
            message: error.code === "PAYMENT_WRITE_BUSY" ? error.message : "Failed to check the payment statement",
        });
    }
};

const generateGuestPaymentStatementPdf = async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: "Invalid booking ID" });
    }
    let statement;
    try {
        const snapshot = await readGuestPaymentStatementSnapshot(req.params.id);
        if (snapshot.status) return res.status(snapshot.status).json({ message: snapshot.message });
        if (snapshot.result.error) return res.status(409).json({ message: snapshot.result.error });
        statement = snapshot.result.value;
    } catch (error) {
        console.error("Payment statement snapshot failed:", error.message);
        return res.status(error.code === "PAYMENT_WRITE_BUSY" ? 409 : 500).json({
            message: error.code === "PAYMENT_WRITE_BUSY" ? error.message : "Failed to load the payment statement",
        });
    }
    try {
        const company = await getDocumentBrandConfig();
        const bytes = await createGuestPaymentStatementPdf(statement, company);
        const safeCode = statement.bookingCode.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 80);
        const filename = `dream-ceylon-payment-statement-${safeCode}.pdf`;
        await createActivityLog({
            req, action: "GENERATE", module: "PDF",
            description: `Guest payment statement generated for booking ${statement.bookingCode}`,
            relatedRecordId: req.params.id, relatedModel: "Booking",
            referenceNo: statement.bookingCode, customerName: statement.guestName,
            metadata: { documentType: "Guest Payment Statement", filename, currency: statement.currency,
                received: statement.receivedCents / 100, refunded: statement.refundedCents / 100,
                balance: statement.balanceCents / 100, paymentCount: statement.rows.length },
        });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("Cache-Control", "no-store");
        return res.send(bytes);
    } catch (error) {
        console.error("Payment statement generation failed:", error.message);
        return res.status(500).json({ message: "Failed to generate the payment statement" });
    }
};

module.exports = { createGuestPaymentStatementPdf, generateGuestPaymentStatementPdf,
    getGuestPaymentStatementReadiness };
