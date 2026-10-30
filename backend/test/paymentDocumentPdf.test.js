const test = require("node:test");
const assert = require("node:assert/strict");
const { PDFDocument } = require("pdf-lib");
const { createPaymentReceiptPdf, paymentDocumentIssue } = require("../controllers/paymentReceiptPdfController");

const readPdf = async (bytes) => {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({ data: new Uint8Array(bytes), disableFontFace: true, useSystemFonts: false });
    try {
        const document = await task.promise;
        const pages = [];
        for (let number = 1; number <= document.numPages; number += 1) {
            const content = await (await document.getPage(number)).getTextContent();
            pages.push(content.items.map(({ str }) => str).join(" "));
        }
        return pages.join(" ");
    } finally {
        await task.destroy();
    }
};

const booking = {
    bookingCode: "CI-DOCUMENT-1", currency: "USD", totalPrice: 500, advancePayment: 200,
    paymentStatus: "Partially Paid", numberOfTravelers: 2,
    customer: { fullName: "Łukasz / Анна / සිංහල / தமிழ்", email: "guest@example.invalid", whatsappNumber: "+94771234567", country: "UK" },
    travelStartDate: new Date("2026-11-01"), travelEndDate: new Date("2026-11-05"),
};
const basePayment = {
    paymentNo: "CI-PAY-1", booking, amount: 50, currency: "USD", status: "Received",
    paymentType: "Advance", paymentMethod: "Bank Transfer", paymentDate: new Date("2026-10-25"),
    referenceNumber: "BANK-1", notes: "PRIVATE STAFF NOTE 98324",
};

test("receipt and refund confirmation use the correct direction and text", async () => {
    const receipt = await createPaymentReceiptPdf(basePayment);
    const refund = await createPaymentReceiptPdf({ ...basePayment,
        paymentNo: "CI-REF-1", status: "Refunded", paymentType: "Refund" });
    assert.equal((await PDFDocument.load(receipt)).getPageCount(), 1);
    assert.equal((await PDFDocument.load(refund)).getPageCount(), 1);
    const receivedText = await readPdf(receipt);
    assert.match(receivedText, /PAYMENT RECEIPT/);
    assert.match(receivedText, /RECEIVED FROM/);
    assert.match(receivedText, /Payment Received/);
    assert.match(receivedText, /confirms the payment received/);
    const compactText = receivedText.replace(/\s+/gu, "");
    for (const name of ["Łukasz", "Анна", "සිංහල", "தமிழ்"]) {
        assert.ok(compactText.includes(name), name);
    }
    for (const privateValue of ["PRIVATE STAFF NOTE", "USD 500.00", "USD 200.00", "USD 300.00", "Partially Paid"]) {
        assert.equal(receivedText.includes(privateValue), false, privateValue);
    }
    const refundText = await readPdf(refund);
    for (const label of ["REFUND CONFIRMATION", "REFUNDED TO", "Refund Amount", "REFUND DETAILS", "This confirmation records the refund"]) {
        assert.ok(refundText.includes(label), label);
    }
    assert.equal(refundText.includes("RECEIVED FROM"), false);
    assert.equal(refundText.includes("confirms the payment received"), false);
    assert.equal(refundText.includes("PRIVATE STAFF NOTE"), false);
});

test("long transaction references wrap onto another page without losing text", async () => {
    const bytes = await createPaymentReceiptPdf({ ...basePayment,
        referenceNumber: `REF-BEGIN ${"bank-confirmation-segment ".repeat(80)} REF-END`,
    });
    assert.ok((await PDFDocument.load(bytes)).getPageCount() > 1);
    const content = await readPdf(bytes);
    assert.ok(content.includes("REF-BEGIN"));
    assert.ok(content.includes("REF-END"));
    assert.ok(content.includes("Reference (continued)"));
});

test("older inconsistent payments must be corrected before a document is issued", () => {
    const issuedAt = new Date("2026-10-31T12:00:00Z");
    assert.equal(paymentDocumentIssue(basePayment, issuedAt), null);
    const cases = [
        { paymentType: "Refund", status: "Received" },
        { status: "Cancelled" },
        { amount: 0 },
        { amount: 10.123 },
        { currency: "LKR" },
        { paymentDate: "invalid" },
        { paymentDate: new Date("2026-11-01T00:00:00Z") },
    ];
    for (const change of cases) {
        assert.ok(paymentDocumentIssue({ ...basePayment, ...change }, issuedAt), JSON.stringify(change));
    }
});
