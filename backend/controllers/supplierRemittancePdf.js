const fs = require("node:fs");
const PDFDocument = require("pdfkit");
const { createBriefText } = require("../utils/briefPdfText");
const { formatDocumentDate } = require("../utils/documentDate");
const { formatRemittanceMoney } = require("../utils/supplierRemittance");

const WIDTH = 595.28, HEIGHT = 841.89, MARGIN = 46;
const CONTENT = WIDTH - 2 * MARGIN;
const green = "#0a6157", ink = "#1f2b33", muted = "#586874", pale = "#edf7f5";

const createSupplierRemittancePdf = async (voucher, company) => {
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
            try { pdf.image(company.logoPath, WIDTH - MARGIN - 95, 17, { fit: [95, 65] }); }
            catch { /* Keep the advice available if the configured logo is invalid. */ }
        }
        text.wrap(company.companyName || "Dream Ceylon Journeys", "bold", 15, CONTENT - 110)
            .slice(0, 2).forEach((line, index) => text.draw(line, {
                x: MARGIN, y: 22 + index * 20, size: 15, weight: "bold", color: green,
            }));
        text.draw("SUPPLIER PAYMENT VOUCHER", { x: MARGIN, y: 88, size: 18, weight: "bold", color: ink });
        text.draw("REMITTANCE ADVICE", { x: MARGIN, y: 118, size: 9, weight: "bold", color: green });
        y = 164;
    };
    const ensureSpace = (height) => { if (y + height > HEIGHT - 75) addPage(); };
    const draw = (value, { size = 10, color = ink, weight = "regular", lineHeight = 16 } = {}) => {
        for (const line of text.wrap(value, weight, size, CONTENT)) {
            ensureSpace(lineHeight);
            text.draw(line, { x: MARGIN, y, size, color, weight });
            y += lineHeight;
        }
    };
    const detail = (label, value) => {
        if (!value) return;
        const lines = text.wrap(value, "regular", 10, CONTENT - 135);
        ensureSpace(Math.min(lines.length * 16 + 8, 130));
        text.draw(label, { x: MARGIN, y, size: 9, color: muted });
        for (const line of lines) {
            ensureSpace(16);
            text.draw(line, { x: MARGIN + 135, y, size: 10, color: ink });
            y += 16;
        }
        y += 8;
    };
    const section = (label) => {
        ensureSpace(70);
        y += 10;
        pdf.rect(MARGIN, y, CONTENT, 26).fill(pale);
        text.draw(label, { x: MARGIN + 10, y: y + 6, size: 10, weight: "bold", color: green });
        y += 38;
    };
    addPage();
    detail("Voucher number", voucher.voucherNumber);
    detail("Revision / issued on", `${voucher.revision} / ${formatDocumentDate(voucher.issuedAt)}`);
    section("SUPPLIER & INVOICE");
    detail("Supplier", voucher.supplierName);
    detail("Accounts email", voucher.supplierEmail);
    detail("Invoice / pro forma", voucher.invoiceReference);
    detail("Booking reference", voucher.bookingCode);
    detail("Guest / reservation", voucher.guestReference);
    section("PAYMENT DETAILS");
    draw(formatRemittanceMoney(voucher.transferAmount, voucher.transferCurrency), { size: 19, weight: "bold", color: green, lineHeight: 30 });
    detail("Payment date", formatDocumentDate(voucher.paymentDate));
    detail("Method", voucher.method);
    detail("Transaction reference", voucher.transferReference);
    y += 6;
    draw("Please acknowledge receipt of the funds and allocation to the invoice, and send us your receipt.", { size: 9, color: muted, lineHeight: 14 });
    y += 8;
    draw("This advice records the payment details supplied by the payer. It is not bank proof or a receipt issued by the supplier, and does not certify that the invoice is settled in full.", { size: 9, color: muted, lineHeight: 14 });
    if (company.email) { y += 12; draw(`Payment enquiries: ${company.email}`, { size: 9, color: muted, lineHeight: 14 }); }

    const pages = pdf.bufferedPageRange().count;
    for (let index = 0; index < pages; index += 1) {
        pdf.switchToPage(index);
        pdf.moveTo(MARGIN, HEIGHT - 58).lineTo(WIDTH - MARGIN, HEIGHT - 58).strokeColor(pale).stroke();
        text.draw(`${voucher.voucherNumber} | Revision ${voucher.revision}`, { x: MARGIN, y: HEIGHT - 47, size: 8, color: muted });
        text.draw(`${index + 1} / ${pages}`, { x: WIDTH - MARGIN - 26, y: HEIGHT - 47, size: 8, color: muted });
    }
    pdf.end();
    return output;
};

module.exports = { createSupplierRemittancePdf };
