const { DOCUMENT_TIME_ZONE } = require("./documentDate");

// Calendar dates in the CRM use Sri Lanka's business day, regardless of server TZ.
// Sri Lanka has used UTC+05:30 continuously since 2006.
const COLOMBO_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const businessDateFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: DOCUMENT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
});

const businessDateParts = (instant = new Date()) => {
    const parts = Object.fromEntries(
        businessDateFormatter.formatToParts(instant).map(({ type, value }) => [type, value])
    );
    return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
    };
};

const getBusinessDayBounds = (instant = new Date()) => {
    const { year, month, day } = businessDateParts(instant);
    const start = new Date(Date.UTC(year, month - 1, day) - COLOMBO_OFFSET_MS);
    return { start, end: new Date(start.getTime() + DAY_MS - 1) };
};

const getBusinessMonthStart = (monthsBack = 0, instant = new Date()) => {
    const { year, month } = businessDateParts(instant);
    return new Date(Date.UTC(year, month - 1 - monthsBack, 1) - COLOMBO_OFFSET_MS);
};

module.exports = { getBusinessDayBounds, getBusinessMonthStart };
