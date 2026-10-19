const parseCalendarDate = (value, label) => {
    if (value === null || value === "") return { value: null };
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return { error: `${label} must be a calendar date in YYYY-MM-DD format` };
    }

    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
        return { error: `${label} must be a valid calendar date` };
    }
    return { value: date };
};

const parsePaymentDueDate = (value) => parseCalendarDate(value, "Payment due date");

module.exports = { parseCalendarDate, parsePaymentDueDate };
