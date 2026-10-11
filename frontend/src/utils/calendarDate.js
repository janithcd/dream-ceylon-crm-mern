const BUSINESS_TIME_ZONE = "Asia/Colombo";
const datePartsFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
});

// CRM calendar fields represent Sri Lankan dates, even for staff working abroad.
export const toCalendarDateInput = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const parts = Object.fromEntries(
        datePartsFormatter.formatToParts(date).map(({ type, value: part }) => [type, part])
    );
    return `${parts.year}-${parts.month}-${parts.day}`;
};

export const todayCalendarDate = (now = new Date()) => toCalendarDateInput(now);

export const formatCalendarDate = (value, { month = "short" } = {}) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("en-US", {
        timeZone: BUSINESS_TIME_ZONE,
        year: "numeric",
        month,
        day: "numeric",
    });
};
