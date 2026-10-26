const test = require("node:test");
const assert = require("node:assert/strict");
const { PDFDocument } = require("pdf-lib");
const { buildGuestPaymentStatement, planGuestPaymentSummaryReconciliation } = require("../utils/guestPaymentStatement");
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

test("readiness identifies every affected payment without exposing private fields", () => {
    const result = buildGuestPaymentStatement(booking(), [
        payment({ paymentNo: "PAY-TYPE", status: "Refunded", notes: "PRIVATE TYPE NOTE" }),
        payment({ paymentNo: "PAY-CURRENCY", currency: "LKR", notes: "PRIVATE CURRENCY NOTE" }),
        payment({ paymentNo: "PAY-FUTURE", paymentDate: new Date("2026-10-26") }),
        payment({ paymentNo: "PAY-CANCELLED", status: "Cancelled", currency: "LKR" }),
    ], issuedAt);
    assert.deepEqual(result.issues.map(({ code, paymentNo }) => [code, paymentNo]), [
        ["payment_direction", "PAY-TYPE"], ["payment_currency", "PAY-CURRENCY"],
        ["future_payment", "PAY-FUTURE"],
    ]);
    assert.equal(result.issues[0].paymentDate, "2026-10-23T00:00:00.000Z");
    assert.equal(JSON.stringify(result).includes("PRIVATE"), false);
    assert.match(result.error, /type and status/);
    assert.deepEqual(buildGuestPaymentStatement(booking(), [
        payment({ paymentNo: "PAY-2", status: "Refunded", paymentType: "Refund", amount: 100 }),
        payment(),
    ], issuedAt).issues, []);
});

test("readiness separates refund deficits and booking summary mismatches", () => {
    const deficit = buildGuestPaymentStatement({ ...booking(), advancePayment: 0 }, [
        payment({ paymentNo: "REF-1", paymentType: "Refund", status: "Refunded", amount: 10 }),
    ], issuedAt);
    assert.deepEqual(deficit.issues.map(({ code }) => code), ["refund_excess"]);
    const mismatch = buildGuestPaymentStatement({ ...booking(), advancePayment: 50 }, [payment()], issuedAt);
    assert.deepEqual(mismatch.issues.map(({ code, paymentNo }) => [code, paymentNo]), [["paid_mismatch", null]]);
});

test("Finance can plan a ledger-backed paid-total correction only after an explicit review", () => {
    const original = { ...booking(), advancePayment: 200, paymentStatus: "Partially Paid" };
    const receipt = payment({ amount: 500 });
    const confirmed = { confirmLedgerComplete: true, reason: "Checked all deposits against the bank statement",
        expectedBookedPaidCents: 20000, expectedLedgerNetCents: 50000, expectedTargetPaidCents: 50000 };
    const plan = planGuestPaymentSummaryReconciliation(original, [receipt], confirmed, issuedAt).value;
    assert.equal(plan.previousPaidCents, 20000);
    assert.equal(plan.targetPaidCents, 50000);
    assert.equal(plan.paymentStatus, "Partially Paid");
    assert.equal(plan.reason, confirmed.reason);
    assert.equal(planGuestPaymentSummaryReconciliation(original, [receipt],
        { ...confirmed, confirmLedgerComplete: false }, issuedAt).status, 400);
    assert.equal(planGuestPaymentSummaryReconciliation(original, [receipt],
        { ...confirmed, expectedLedgerNetCents: 40000 }, issuedAt).status, 409);
    assert.equal(planGuestPaymentSummaryReconciliation({ ...original, advancePayment: 500 },
        [receipt], confirmed, issuedAt).status, 409);
    assert.equal(planGuestPaymentSummaryReconciliation(original,
        [receipt, payment({ currency: "LKR" })], confirmed, issuedAt).status, 409);
    const refunded = planGuestPaymentSummaryReconciliation(
        { ...original, advancePayment: 50 }, [payment({ amount: 100 }),
            payment({ status: "Refunded", paymentType: "Refund", amount: 100 })],
        { ...confirmed, expectedBookedPaidCents: 5000, expectedLedgerNetCents: 0,
            expectedTargetPaidCents: 0 }, issuedAt).value;
    assert.equal(refunded.targetPaidCents, 0);
    assert.equal(refunded.paymentStatus, "Refunded");
    const unitemized = planGuestPaymentSummaryReconciliation(
        { ...original, advancePayment: 100 }, [],
        { ...confirmed, expectedBookedPaidCents: 10000, expectedLedgerNetCents: 0,
            expectedTargetPaidCents: 0 }, issuedAt).value;
    assert.equal(unitemized.targetPaidCents, 0);
    assert.equal(unitemized.paymentStatus, "Pending");
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
