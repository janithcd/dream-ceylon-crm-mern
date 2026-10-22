const { parseCalendarDate } = require("./paymentDueDate");
const { getBusinessDayBounds } = require("./businessDate");

const VALIDITY_FILTERS = ["all", "pastDue", "dueSoon", "noDate"];
const DAY_MS = 24 * 60 * 60 * 1000;

const parseQuotationValidUntil = (value) =>
    parseCalendarDate(value === undefined ? null : value, "Quotation valid until");

// Today and the following six Sri Lanka calendar days form the seven-day window.
const getValidityWindow = (now = new Date()) => ({
    today: getBusinessDayBounds(now).start,
    sevenDayEnd: getBusinessDayBounds(new Date(now.getTime() + 6 * DAY_MS)).end,
});

const getQuotationValidityState = (quotation, now = new Date()) => {
    if (quotation.status !== "Sent" || !quotation.validUntil) return "none";
    const date = new Date(quotation.validUntil);
    if (Number.isNaN(date.getTime())) return "none";
    const { today, sevenDayEnd } = getValidityWindow(now);
    if (date < today) return "pastDue";
    if (date <= sevenDayEnd) return "dueSoon";
    return "current";
};

const getValidityQuery = (filter, now = new Date()) => {
    const { today, sevenDayEnd } = getValidityWindow(now);
    if (filter === "pastDue") return { status: "Sent", validUntil: { $lt: today } };
    if (filter === "dueSoon") return { status: "Sent", validUntil: { $gte: today, $lte: sevenDayEnd } };
    if (filter === "noDate") return { status: "Sent", validUntil: null };
    return {};
};

module.exports = { VALIDITY_FILTERS, parseQuotationValidUntil, getQuotationValidityState, getValidityQuery };
