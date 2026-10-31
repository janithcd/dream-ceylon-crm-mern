const { parseSupplierPayment } = require("./supplierPayment");
const { formatDocumentDate } = require("./documentDate");

const CURRENCIES = Object.freeze(["USD", "LKR", "EUR", "GBP"]);
const fields = Object.freeze({ supplierName: 160, supplierEmail: 254, invoiceReference: 80,
    guestReference: 200, transferReference: 100, changeReason: 300 });
const labels = { supplierName: "Supplier name", supplierEmail: "Supplier email", invoiceReference: "Invoice reference",
    guestReference: "Guest / reservation reference", transferReference: "Transfer reference", changeReason: "Reason for correction" };

const getRemittancePayment = (cost, payment, now = new Date()) => {
    if (cost.recordType !== "Booking" || payment?.kind !== "payment" || !CURRENCIES.includes(cost.currency)) {
        return { error: "Choose an individual booking supplier payment. Opening balances and corrections cannot have vouchers." };
    }
    const date = payment.paymentDate ? new Date(payment.paymentDate) : null;
    if (!date || Number.isNaN(date.getTime())) return { error: "The recorded payment needs a valid payment date." };
    const parsed = parseSupplierPayment({ amount: payment.amount, paymentDate: date.toISOString().slice(0, 10),
        method: payment.method }, 1000000000, now);
    if (parsed.error) return { error: `The recorded payment cannot be used: ${parsed.error}` };
    return { value: { amount: parsed.value.amount, currency: cost.currency,
        paymentDate: parsed.value.paymentDate, method: parsed.value.method, reference: payment.reference || "" } };
};

const parseRemittanceDetails = (body, payment, hasRevision = false) => {
    const value = {};
    for (const [field, max] of Object.entries(fields)) {
        const raw = body?.[field] ?? "";
        if (typeof raw !== "string" || raw.trim().length > max || /[\p{Cc}\u2028\u2029\u202a-\u202e\u2066-\u2069]/u.test(raw)) {
            return { error: `${labels[field]} must be a single line of at most ${max} characters.` };
        }
        value[field] = raw.trim();
    }
    if (!value.supplierName || !value.invoiceReference) return { error: "Enter the supplier name and invoice reference." };
    if (value.supplierEmail && !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value.supplierEmail)) {
        return { error: "Enter one valid supplier email address, or leave it blank." };
    }
    if (hasRevision && value.changeReason.length < 3) return { error: "Enter a reason for correcting the saved voucher (at least 3 characters)." };
    if (!["string", "number"].includes(typeof body?.transferAmount) || String(body.transferAmount).trim() === "") {
        return { error: "Enter the actual amount sent to the supplier." };
    }
    const amount = Number(body.transferAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000000 || Math.round(amount * 100) / 100 !== amount) {
        return { error: "The transferred amount must be positive, at most 1,000,000,000, with at most two decimal places." };
    }
    if (!CURRENCIES.includes(body.transferCurrency)) return { error: "Choose the actual currency transferred." };
    if (body.transferCurrency === payment.currency && amount !== payment.amount) {
        return { error: "For the same currency, the amount sent must match this recorded payment. Each voucher covers one payment; exclude bank charges." };
    }
    if (["Bank transfer", "Card"].includes(payment.method) && !value.transferReference) {
        return { error: "Enter the bank or card transaction reference from the payment confirmation." };
    }
    if (body.confirmed !== true) return { error: "Check the supplier, invoice and actual transfer details against the payment confirmation before saving." };
    return { value: { ...value, transferAmount: amount, transferCurrency: body.transferCurrency } };
};

const voucherNumber = (paymentId) => `SPV-${String(paymentId).toUpperCase()}`;
const formatRemittanceMoney = (amount, currency) => `${currency} ${Number(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
})}`;

// Only deliberately reviewed, supplier-facing fields may reach the PDF or email.
const publicRemittance = (paymentId, revision) => ({
    voucherNumber: voucherNumber(paymentId), revision: revision.revision,
    supplierName: revision.supplierName, supplierEmail: revision.supplierEmail,
    invoiceReference: revision.invoiceReference, guestReference: revision.guestReference,
    transferAmount: revision.transferAmount, transferCurrency: revision.transferCurrency,
    transferReference: revision.transferReference, bookingCode: revision.bookingCode,
    paymentDate: revision.paymentDate, method: revision.method, issuedAt: revision.issuedAt,
});

const buildRemittanceEmail = (voucher, company) => {
    const companyName = String(company.companyName || "Dream Ceylon Journeys").replace(/[\p{Cc}\u2028\u2029\u202a-\u202e\u2066-\u2069]/gu, " ").slice(0, 160);
    const lines = ["Dear Accounts Team,", "", `Please find the payment details for ${voucher.supplierName} below.`, "",
        `Invoice / pro forma: ${voucher.invoiceReference}`,
        `Booking reference: ${voucher.bookingCode}`];
    if (voucher.guestReference) lines.push(`Guest / reservation: ${voucher.guestReference}`);
    lines.push(`Payment date: ${formatDocumentDate(voucher.paymentDate)}`,
        `Amount sent: ${formatRemittanceMoney(voucher.transferAmount, voucher.transferCurrency)}`,
        `Method: ${voucher.method}`);
    if (voucher.transferReference) lines.push(`Transaction reference: ${voucher.transferReference}`);
    lines.push(`Payment voucher: ${voucher.voucherNumber} (revision ${voucher.revision})`, "",
        "Please acknowledge receipt of the funds and allocation to the invoice, and send us your receipt.", "",
        "Kind regards,", companyName);
    return { recipient: voucher.supplierEmail, subject: `Payment advice - ${voucher.invoiceReference}`,
        body: lines.join("\n") };
};

module.exports = { getRemittancePayment, parseRemittanceDetails, voucherNumber, publicRemittance,
    formatRemittanceMoney, buildRemittanceEmail };
