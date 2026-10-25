const test = require("node:test");
const assert = require("node:assert/strict");
const { PDFDocument } = require("pdf-lib");
const { createPaymentReceiptPdf } = require("../controllers/paymentReceiptPdfController");

const readPdf = async (bytes) => {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({ data: new Uint8Array(bytes), disableFontFace: true, useSystemFonts: false });
    try {
        const document = await task.promise;
        const page = await document.getPage(1);
        const content = await page.getTextContent();
        return content.items.map(({ str }) => str).join(" ");
    } finally {
        await task.destroy();
    }
};

const booking = {
    bookingCode: "CI-DOCUMENT-1", currency: "USD", totalPrice: 500, advancePayment: 200,
    paymentStatus: "Partially Paid", numberOfTravelers: 2,
    customer: { fullName: "Test Guest", email: "guest@example.invalid", whatsappNumber: "+94771234567", country: "UK" },
    travelStartDate: new Date("2026-11-01"), travelEndDate: new Date("2026-11-05"),
};
const basePayment = {
    paymentNo: "CI-PAY-1", booking, amount: 50, currency: "USD", status: "Received",
    paymentType: "Advance", paymentMethod: "Bank Transfer", paymentDate: new Date("2026-10-25"),
    referenceNumber: "BANK-1", notes: "",
};

test("receipt and refund confirmation use the correct direction and text", async () => {
    const receipt = await createPaymentReceiptPdf(basePayment);
    const refund = await createPaymentReceiptPdf({ ...basePayment,
        paymentNo: "CI-REF-1", status: "Refunded", paymentType: "Refund" });
    assert.equal((await PDFDocument.load(receipt)).getPageCount(), 1);
    assert.equal((await PDFDocument.load(refund)).getPageCount(), 1);
    const receivedText = await readPdf(receipt);
    assert.match(receivedText, /PAYMENT RECEIPT/);
    assert.match(receivedText, /Received From/);
    assert.match(receivedText, /Payment Received/);
    assert.match(receivedText, /confirms the payment received/);
    const refundText = await readPdf(refund);
    for (const label of ["REFUND CONFIRMATION", "Refunded To", "Refund Amount", "Refund Details", "Refund Notes", "confirms a refund recorded"]) {
        assert.ok(refundText.includes(label), label);
    }
    assert.equal(refundText.includes("Received From"), false);
    assert.equal(refundText.includes("confirms the payment received"), false);
});
