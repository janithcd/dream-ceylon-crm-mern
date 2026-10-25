const { getBusinessDayBounds } = require("./businessDate");

const FIELDS = ["booking", "amount", "currency", "paymentDate", "paymentType",
    "paymentMethod", "status", "referenceNumber", "notes"];

const snapshot = (payment) => Object.fromEntries(FIELDS.map((field) => {
    const value = payment[field];
    if (field === "booking") return [field, String(value?._id || value || "")];
    if (field === "paymentDate") {
        const date = new Date(value);
        return [field, Number.isNaN(date.getTime()) ? "" : date.toISOString()];
    }
    return [field, value];
}));

const validatePaymentCorrection = (previous, next, body, now = new Date()) => {
    const before = snapshot(previous);
    const after = snapshot(next);
    const changedFields = FIELDS.filter((field) => before[field] !== after[field]);
    if (!changedFields.length) return { error: "No payment details changed." };

    const reason = body?.correctionReason;
    if (typeof reason !== "string" || reason.trim().length < 3 || reason.trim().length > 300) {
        return { error: "Enter a correction reason (3–300 characters) for payment edits." };
    }
    const date = new Date(next.paymentDate);
    if (Number.isNaN(date.getTime()) ||
        getBusinessDayBounds(date).start > getBusinessDayBounds(now).end) {
        return { error: "Choose a valid payment date no later than today in Sri Lanka." };
    }
    if (body?.paymentDate !== undefined &&
        (typeof body.paymentDate !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(body.paymentDate) ||
        Number.isNaN(new Date(body.paymentDate).getTime()) ||
        new Date(body.paymentDate).toISOString().slice(0, 10) !== body.paymentDate)) {
        return { error: "Enter a valid payment date as YYYY-MM-DD." };
    }
    if (!["Received", "Refunded", "Cancelled"].includes(next.status) ||
        !["Advance", "Partial Payment", "Final Payment", "Refund", "Other"].includes(next.paymentType) ||
        !["Cash", "Bank Transfer", "Card", "Online Payment", "Other"].includes(next.paymentMethod)) {
        return { error: "Choose a valid payment status, type and method." };
    }

    // Payment notes can contain private operational details. Only log that they changed.
    const auditBefore = { ...before, notes: undefined };
    const auditAfter = { ...after, notes: undefined };
    return { value: { reason: reason.trim(), changedFields, before: auditBefore, after: auditAfter } };
};

module.exports = { validatePaymentCorrection };
