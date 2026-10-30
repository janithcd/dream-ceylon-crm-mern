const test = require("node:test");
const assert = require("node:assert/strict");
const { PDFDocument } = require("pdf-lib");
const { createInvoicePdf } = require("../controllers/bookingPdfController");

test("invoice prints public payment instructions without private notes or unchecked paid totals", async () => {
    const booking = {
        bookingCode: "CI-INVOICE-1", bookingStatus: "Confirmed", currency: "USD",
        customer: { fullName: "Synthetic Guest", email: "guest@example.invalid",
            whatsappNumber: "+94771234567", country: "UK" },
        travelStartDate: new Date("2026-11-10"), travelEndDate: new Date("2026-11-16"),
        numberOfTravelers: 2, vehicleType: "Car", totalPrice: 1000,
        hotelAdvanceAmount: 300, hotelAdvanceDueDate: new Date("2026-11-01"),
        paymentDueDate: new Date("2026-11-09"), advancePayment: 217,
        paymentStatus: "Partially Paid", adminNotes: "PRIVATE ADMIN RATE 99123",
        specialRequests: "PRIVATE GUEST REQUEST 88776",
    };
    const bytes = await createInvoicePdf(booking, { pdfSettings: {
        paymentInstructions: "Public payment instruction: quote CI-INVOICE-1.",
    } });
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({ data: new Uint8Array(bytes), disableFontFace: true, useSystemFonts: false });
    try {
        const document = await task.promise;
        const content = await (await document.getPage(1)).getTextContent();
        const text = content.items.map(({ str }) => str).join(" ");
        for (const label of ["BOOKING INVOICE", "USD 1,000.00", "USD 300.00",
            "Public payment instruction", "Nov 1, 2026", "Nov 9, 2026",
            "Check the guest payment statement for your current balance before paying."]) {
            assert.ok(text.includes(label), label);
        }
        for (const privateValue of ["PRIVATE ADMIN RATE", "PRIVATE GUEST REQUEST",
            "USD 217.00", "Partially Paid", "Balance"]) {
            assert.equal(text.includes(privateValue), false, privateValue);
        }
    } finally {
        await task.destroy();
    }
});

test("long public payment instructions continue onto another invoice page", async () => {
    const bytes = await createInvoicePdf({
        bookingCode: "CI-INVOICE-LONG", bookingStatus: "Confirmed", currency: "USD",
        customer: { fullName: "Synthetic Guest" }, numberOfTravelers: 1,
        totalPrice: 100, travelStartDate: new Date("2026-11-10"),
        travelEndDate: new Date("2026-11-11"),
    }, { pdfSettings: { paymentInstructions: "Please quote the booking reference. ".repeat(35) } });
    assert.ok((await PDFDocument.load(bytes)).getPageCount() > 1);
});
