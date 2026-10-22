const { parseCalendarDate } = require("./paymentDueDate");
const { getBusinessDayBounds } = require("./businessDate");

const METHODS = Object.freeze(["Bank transfer", "Cash", "Card", "Other"]);
const COLOMBO_OFFSET_MS = 330 * 60 * 1000;

const parseSupplierPayment = (body, remaining, now = new Date()) => {
    const amount = Number(body?.amount);
    const cents = Math.round(amount * 100);
    if (body?.amount === undefined || body.amount === "" || !Number.isFinite(amount) || amount <= 0 ||
        amount > 1000000000 || cents / 100 !== amount || cents > Math.round(remaining * 100)) {
        return { error: "Enter a positive payment of at most the remaining balance, with at most two decimal places." };
    }
    const date = parseCalendarDate(body?.paymentDate, "Supplier payment date");
    if (date.error || !date.value) return { error: date.error || "Enter the supplier payment date." };
    const todayUtcMidnight = getBusinessDayBounds(now).start.getTime() + COLOMBO_OFFSET_MS;
    if (date.value.getTime() > todayUtcMidnight) return { error: "Supplier payment date cannot be in the future." };
    const method = body?.method;
    if (!METHODS.includes(method)) return { error: "Choose a supplier payment method." };

    const reference = body?.reference ?? "";
    const note = body?.note ?? "";
    if (typeof reference !== "string" || reference.trim().length > 100 ||
        typeof note !== "string" || note.trim().length > 300) {
        return { error: "Reference must be at most 100 characters and note at most 300 characters." };
    }
    return { value: { amount, paymentDate: date.value, method, reference: reference.trim(), note: note.trim() } };
};

module.exports = { METHODS, parseSupplierPayment };
