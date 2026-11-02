const test = require("node:test");
const assert = require("node:assert/strict");
const { prepareClientPaymentEmail } = require("../utils/clientPaymentEmail");
const { sendClientPaymentDocuments, sendPasswordResetCode } = require("../utils/transactionalEmail");

const booking = {
    _id: "507f1f77bcf86cd799439011", bookingCode: "DCJ-2026-357729",
    bookingStatus: "Confirmed", currency: "USD",
    customer: { fullName: "Ashlee Reed", email: "reed.ashlee@example.com" },
    adminNotes: "PRIVATE ADMIN NOTE",
};
const payment = {
    _id: "507f1f77bcf86cd799439012", booking: booking._id,
    paymentNo: "DCJ-PAY-2026-733961", paymentDate: new Date("2025-10-30"),
    paymentType: "Advance", paymentMethod: "PayHere", status: "Received",
    currency: "USD", amount: 663, referenceNumber: "#320049073282",
    notes: "PRIVATE PAYMENT NOTE",
};
const statement = {
    bookingCode: booking.bookingCode, guestName: booking.customer.fullName,
    bookingStatus: booking.bookingStatus, currency: booking.currency,
    totalCents: 261600, netPaidCents: 66300, balanceCents: 195300,
    finalDueDate: new Date("2027-02-27"),
    rows: [{ paymentNo: payment.paymentNo, amountCents: 66300, date: payment.paymentDate }],
};

test("PayHere email requires a verified gross charge and explains the fee without changing the tour balance", () => {
    const missing = prepareClientPaymentEmail({ booking, payment, statement });
    assert.equal(missing.ready, false);
    assert.equal(missing.amountCents, 66300);
    const draft = prepareClientPaymentEmail({ booking, payment, statement, chargedAmount: "682.89" });
    assert.equal(draft.ready, true);
    assert.equal(draft.to, "reed.ashlee@example.com");
    assert.equal(draft.chargeCents, 68289);
    assert.equal(draft.feeCents, 1989);
    assert.equal(draft.balanceCents, 195300);
    for (const text of ["USD 682.89", "USD 663.00", "USD 19.89", "USD 1,953.00", "Feb 27, 2027"]) {
        assert.match(draft.textbody, new RegExp(text.replace(/[.]/g, "\\.")));
    }
    assert.deepEqual(draft.attachments, [
        "dream-ceylon-payment-receipt-DCJ-PAY-2026-733961.pdf",
        "dream-ceylon-payment-statement-DCJ-2026-357729.pdf",
    ]);
    assert.equal(JSON.stringify(draft).includes("PRIVATE"), false);
});

test("draft rejects misleading charges, refunds and invalid recipients and changes its review fingerprint", () => {
    for (const chargedAmount of ["662.99", "682.899", "abc", "1300.00", 682.89]) {
        assert.equal(prepareClientPaymentEmail({ booking, payment, statement, chargedAmount }).status, 400);
    }
    assert.equal(prepareClientPaymentEmail({ booking, payment: { ...payment, status: "Refunded" },
        statement, chargedAmount: "682.89" }).status, 409);
    assert.equal(prepareClientPaymentEmail({ booking: { ...booking, customer: { email: "bad\r\nBcc: x" } },
        payment, statement, chargedAmount: "682.89" }).status, 409);
    const initial = prepareClientPaymentEmail({ booking, payment, statement, chargedAmount: "682.89" });
    const changed = prepareClientPaymentEmail({ booking, payment, statement: { ...statement, balanceCents: 194300 }, chargedAmount: "682.89" });
    assert.notEqual(initial.fingerprint, changed.fingerprint);
    const bank = prepareClientPaymentEmail({ booking, payment: { ...payment, paymentMethod: "Bank Transfer" }, statement });
    assert.equal(bank.ready, true);
    assert.equal(bank.feeCents, 0);
    assert.doesNotMatch(bank.textbody, /PayHere/);
});

test("Zoho payload includes only the requested PDFs and OTP sending remains supported", async () => {
    const originalFetch = global.fetch;
    const originalEnv = { key: process.env.ZOHO_CPaaS_API_KEY, from: process.env.ZOHO_CPaaS_FROM,
        url: process.env.ZOHO_CPaaS_API_URL };
    process.env.ZOHO_CPaaS_API_KEY = "test-key";
    process.env.ZOHO_CPaaS_FROM = "admin@dreamceylonjourneys.com";
    process.env.ZOHO_CPaaS_API_URL = "https://cpaas.zoho.com/v1.1/email";
    const payloads = [];
    global.fetch = async (_url, options) => {
        payloads.push(JSON.parse(options.body));
        return { ok: true, status: 200,
            json: async () => ({ message: "OK", request_id: "REQ-123", data: [{ message: "OK" }] }) };
    };
    try {
        const id = await sendClientPaymentDocuments({ to: booking.customer.email,
            subject: "Payment confirmation", textbody: "Attached.",
            attachments: [{ name: "receipt.pdf", bytes: Buffer.from("%PDF-1.4") },
                { name: "statement.pdf", bytes: Buffer.from("%PDF-1.4") }] });
        assert.equal(id, "REQ-123");
        assert.deepEqual(payloads[0].attachments.map(({ name, mime_type, content }) =>
            [name, mime_type, Buffer.from(content, "base64").toString()]), [
            ["receipt.pdf", "application/pdf", "%PDF-1.4"],
            ["statement.pdf", "application/pdf", "%PDF-1.4"],
        ]);
        assert.equal(payloads[0].to[0].email_address.address, booking.customer.email);
        await sendPasswordResetCode({ to: "admin@example.com", code: "123456" });
        assert.match(payloads[1].textbody, /123456/);
        assert.equal(payloads[1].attachments, undefined);
        global.fetch = async () => ({ ok: false, status: 400,
            json: async () => ({ message: "ERROR", data: [{ error_code: "SM_111" }] }) });
        await assert.rejects(sendClientPaymentDocuments({ to: booking.customer.email,
            subject: "Payment", textbody: "Test", attachments: [] }),
        (error) => error.definitivelyRejected === true && /SM_111/.test(error.message));
    } finally {
        global.fetch = originalFetch;
        if (originalEnv.key === undefined) delete process.env.ZOHO_CPaaS_API_KEY;
        else process.env.ZOHO_CPaaS_API_KEY = originalEnv.key;
        if (originalEnv.from === undefined) delete process.env.ZOHO_CPaaS_FROM;
        else process.env.ZOHO_CPaaS_FROM = originalEnv.from;
        if (originalEnv.url === undefined) delete process.env.ZOHO_CPaaS_API_URL;
        else process.env.ZOHO_CPaaS_API_URL = originalEnv.url;
    }
});
