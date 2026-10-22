const { getBusinessDayBounds } = require("./businessDate");

const DAY_MS = 24 * 60 * 60 * 1000;
const FILTERS = Object.freeze(["due7", "overdue", "later", "unscheduled", "all"]);

const parseSupplierScheduleQuery = (params = {}, now = new Date()) => {
    const filter = params.filter ?? "due7";
    if (!FILTERS.includes(filter)) return { error: "Choose a valid supplier due date filter." };
    const rawPage = params.page ?? "1";
    const rawLimit = params.limit ?? "25";
    if (!["string", "number"].includes(typeof rawPage) || !["string", "number"].includes(typeof rawLimit) ||
        !/^[1-9]\d*$/.test(String(rawPage)) || !/^[1-9]\d*$/.test(String(rawLimit)) ||
        Number(rawPage) > 1000 || Number(rawLimit) > 50) {
        return { error: "Page must be 1–1000 and limit must be 1–50." };
    }
    const page = Number(rawPage);
    const limit = Number(rawLimit);
    const { start } = getBusinessDayBounds(now);
    const nextWeek = new Date(start.getTime() + 7 * DAY_MS);
    const dateFilter = {
        due7: { $ne: null, $lt: nextWeek },
        overdue: { $ne: null, $lt: start },
        later: { $gte: nextWeek },
        unscheduled: null,
        all: undefined,
    }[filter];
    return { value: {
        filter, page, limit,
        query: {
            recordType: "Booking",
            $expr: { $lt: [{ $ifNull: ["$paidAmount", 0] }, "$amount"] },
            ...(dateFilter === undefined ? {} : { paymentDueDate: dateFilter }),
        },
    } };
};

module.exports = { FILTERS, parseSupplierScheduleQuery };
