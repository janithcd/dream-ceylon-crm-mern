const test = require("node:test");
const assert = require("node:assert/strict");
const { PDFDocument } = require("pdf-lib");
const { buildGuestPaymentStatement } = require("../utils/guestPaymentStatement");
const { createGuestPaymentStatementPdf } = require("../controllers/guestPaymentStatementPdfController");

const booking = () => ({
    bookingCode: "DCJ-STATEMENT-1", bookingStatus: "Confirmed", currency: "USD",
    customer: { fullName: "Guest José සිංහල", email: "private@example.invalid" },
    travelStartDate: new Date("2026-11-01"), travelEndDate: new Date("2026-11-05"),
    totalPrice: 1000, advancePayment: 400, hotelAdvanceAmount: 500,
    hotelAdvanceDueDate: new Date("2026-10-27"), paymentDueDate: new Date("2026-11-01"),
    adminNotes: "PRIVATE BOOKING NOTE", specialRequests: "PRIVATE REQUEST",
    supplierCosts: 9000,
});
const payment = (overrides = {}) => ({
    paymentNo: "PAY-1", paymentDate: new Date("2026-10-23"), status: "Received",
    paymentType: "Advance", currency: "USD", amount: 500, paymentMethod: "Bank Transfer",
    referenceNumber: "BANK-123", notes: "PRIVATE PAYMENT NOTE", ...overrides,
});
const issuedAt = new Date("2026-10-25T08:00:00Z");

test("statement reconciles receipts, refunds, hotel advance and cancelled entries in cents", () => {
    const result = buildGuestPaymentStatement(booking(), [
        payment({ paymentNo: "PAY-2", paymentDate: new Date("2026-10-24"),
            status: "Refunded", paymentType: "Refund", amount: 100 }),
        payment(), payment({ status: "Cancelled", amount: 8000, currency: "LKR" }),
    ], issuedAt);
    const statement = result.value;
    assert.equal(statement.receivedCents, 50000);
    assert.equal(statement.refundedCents, 10000);
    assert.equal(statement.netPaidCents, 40000);
    assert.equal(statement.balanceCents, 60000);
    assert.equal(statement.hotelAdvanceOutstandingCents, 10000);
    assert.deepEqual(statement.rows.map((row) => [row.paymentNo, row.kind]),
        [["PAY-1", "Receipt"], ["PAY-2", "Refund"]]);
    assert.equal(JSON.stringify(statement).includes("PRIVATE"), false);
    assert.equal(JSON.stringify(statement).includes("supplierCosts"), false);
    assert.equal(JSON.stringify(statement).includes("private@example.invalid"), false);
});

test("a statement stops when the ledger would mislead the guest", () => {
    const cases = [
        [booking(), [payment({ currency: "LKR" })], /different-currency/],
        [booking(), [payment({ status: "Refunded" })], /type and status/],
        [booking(), [payment({ amount: 1.001 })], /amounts and dates/],
        [booking(), [payment({ paymentDate: new Date("2026-10-26") })], /Future-dated/],
        [{ ...booking(), advancePayment: 200 }, [payment()], /paid amount differs/],
        [{ ...booking(), bookingStatus: "Cancelled" }, [payment()], /cancelled booking/],
        [{ ...booking(), advancePayment: 0 }, [payment({ paymentNo: "REF-1", paymentType: "Refund", status: "Refunded", amount: 10 })], /refunds exceed receipts/],
    ];
    for (const [item, rows, message] of cases) {
        assert.match(buildGuestPaymentStatement(item, rows, issuedAt).error, message);
    }
    const credit = buildGuestPaymentStatement({ ...booking(), totalPrice: 100, advancePayment: 100,
        hotelAdvanceAmount: 0 }, [payment({ amount: 120 })], issuedAt).value;
    assert.equal(credit.creditCents, 2000);
    assert.equal(credit.balanceCents, 0);
});

test("statement PDF carries the guest totals across pages without private notes", async () => {
    const rows = [payment(), payment({ paymentNo: "REF-1", status: "Refunded",
        paymentType: "Refund", amount: 100, paymentDate: new Date("2026-10-24") })];
    for (let index = 0; index < 45; index += 1) {
        rows.push(payment({ paymentNo: `HISTORY-${index}`, amount: 1,
            referenceNumber: `Bank reference ${index}` }));
    }
    rows.push(payment({ paymentNo: "CANCELLED-0", status: "Cancelled", amount: 2 }));
    const statement = buildGuestPaymentStatement({ ...booking(), advancePayment: 445 }, rows, issuedAt).value;
    const bytes = await createGuestPaymentStatementPdf(statement, {
        companyName: "Dream Ceylon Journeys", email: "info@dreamceylonjourneys.com",
        whatsapp: "+94771234567",
    });
    const document = await PDFDocument.load(bytes);
    assert.ok(document.getPageCount() >= 2);
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({ data: new Uint8Array(bytes), disableFontFace: true, useSystemFonts: false });
    try {
        const parsed = await task.promise;
        const pages = [];
        for (let page = 1; page <= parsed.numPages; page += 1) {
            const content = await (await parsed.getPage(page)).getTextContent();
            pages.push(content.items.map(({ str }) => str).join(" "));
        }
        assert.ok(pages.every((page) => page.includes("GUEST PAYMENT STATEMENT")));
        const printed = pages.join(" ");
        for (const expected of ["GUEST PAYMENT STATEMENT", "555.00", "100.00", "HOTEL ADVANCE", "REF-1", "HISTORY-44", "2 / "]) {
            assert.ok(printed.includes(expected), expected);
        }
        for (const privateValue of ["PRIVATE", "private@example.invalid", "9000", "CANCELLED-0"]) {
            assert.equal(printed.includes(privateValue), false, privateValue);
        }
    } finally { await task.destroy(); }
});
