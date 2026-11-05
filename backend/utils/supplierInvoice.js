const { cleanField } = require("./supplierPaymentEvidence");
const { parseCalendarDate } = require("./paymentDueDate");

const CURRENCIES = ["USD", "LKR", "EUR", "GBP"];
const parseInvoiceDetails = (body) => {
    if (!cleanField(body?.supplierName, 160, 2) || !cleanField(body?.invoiceReference, 100, 1)) {
        return { error: "Enter the supplier name and invoice or pro forma reference." };
    }
    const invoiceDate = parseCalendarDate(body.invoiceDate, "Invoice date");
    const dueDate = parseCalendarDate(body.dueDate ?? "", "Supplier due date");
    if (invoiceDate.error || !invoiceDate.value || dueDate.error || (dueDate.value && dueDate.value < invoiceDate.value)) {
        return { error: "Enter a valid invoice date and a due date on or after it, if the supplier gave one." };
    }
    const amount = Number(body.amount);
    if (!["string", "number"].includes(typeof body.amount) || String(body.amount).trim() === "" ||
        !Number.isFinite(amount) || amount < 0.01 || amount > 1000000000 || Math.round(amount * 100) / 100 !== amount ||
        !CURRENCIES.includes(body.currency)) {
        return { error: "Enter the invoice amount with at most two decimals and choose its currency." };
    }
    return { value: { supplierName: body.supplierName.trim(), invoiceReference: body.invoiceReference.trim(),
        referenceKey: body.invoiceReference.trim().toLocaleLowerCase("en"), invoiceDate: invoiceDate.value,
        dueDate: dueDate.value, amount, currency: body.currency } };
};

const parseInvoiceReview = (body) => {
    if (!Number.isSafeInteger(body?.expectedVersion) || body.expectedVersion < 0) {
        return { error: "Reload the invoice before changing its review status." };
    }
    if (body.status === "Approved" && body.confirmed === true) return { value: { status: "Approved", note: "" } };
    if (body.status === "Disputed" && cleanField(body.note, 300, 3)) {
        return { value: { status: "Disputed", note: body.note.trim() } };
    }
    return { error: "Confirm the invoice details before approval, or enter a reason for a dispute (3–300 characters)." };
};

const parseInvoiceVoid = (body) => Number.isSafeInteger(body?.expectedVersion) && body.expectedVersion >= 0 &&
    cleanField(body.reason, 300, 3) ? { value: body.reason.trim() } :
    { error: "Reload the invoice and enter a reason for voiding it (3–300 characters)." };

const invoiceView = (doc) => ({ _id: doc._id, cost: doc.cost, supplierName: doc.supplierName,
    invoiceReference: doc.invoiceReference, invoiceDate: doc.invoiceDate, dueDate: doc.dueDate,
    amount: doc.amount, currency: doc.currency, status: doc.status, reviewHistory: doc.reviewHistory,
    filename: doc.filename, contentType: doc.contentType, size: doc.size,
    createdAt: doc.createdAt, createdByName: doc.createdByName,
    voidedAt: doc.voidedAt, voidedByName: doc.voidedByName, voidReason: doc.voidReason, __v: doc.__v });

module.exports = { parseInvoiceDetails, parseInvoiceReview, parseInvoiceVoid, invoiceView };
