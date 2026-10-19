const { getBusinessDayBounds } = require("./businessDate");

const DATE_FILTERS = ["next30", "departed", "later", "all"];
const DUE_FILTERS = ["all", "overdue", "due7", "later", "unscheduled"];
const PAGE_SIZE = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_BOOKING_STATUSES = ["Pending", "Confirmed", "In Progress", "Completed"];

const buildOutstandingBalancesPipeline = ({ dateFilter = "next30", dueFilter = "all", page = 1 } = {}, now = new Date()) => {
    const { start } = getBusinessDayBounds(now);
    const laterStart = new Date(start.getTime() + 30 * DAY_MS);
    const nextWeek = new Date(start.getTime() + 7 * DAY_MS);
    const departureMatch = dateFilter === "departed"
        ? [{ $match: { travelStartDate: { $lt: start } } }]
        : dateFilter === "next30"
            ? [{ $match: { travelStartDate: { $gte: start, $lt: laterStart } } }]
            : dateFilter === "later"
                ? [{ $match: { travelStartDate: { $gte: laterStart } } }]
                : [];
    const dueMatch = dueFilter === "overdue"
        ? [{ $match: { paymentDueDate: { $ne: null, $lt: start } } }]
        : dueFilter === "due7"
            ? [{ $match: { paymentDueDate: { $gte: start, $lt: nextWeek } } }]
            : dueFilter === "later"
                ? [{ $match: { paymentDueDate: { $gte: nextWeek } } }]
                : dueFilter === "unscheduled"
                    ? [{ $match: { paymentDueDate: null } }]
                    : [];
    const selected = [...departureMatch, ...dueMatch];

    const countIf = (condition) => ({ $sum: { $cond: [condition, 1, 0] } });
    const dueExists = { $ne: ["$paymentDueDate", null] };

    return [
        { $match: {
            bookingStatus: { $in: OPEN_BOOKING_STATUSES },
            totalPrice: { $gt: 0 },
        } },
        { $project: {
            bookingCode: 1,
            customerName: "$customer.fullName",
            travelStartDate: 1,
            travelEndDate: 1,
            bookingStatus: 1,
            paymentDueDate: { $ifNull: ["$paymentDueDate", null] },
            currency: 1,
            totalPrice: 1,
            recordedPaid: { $ifNull: ["$advancePayment", 0] },
            balance: { $round: [{ $subtract: ["$totalPrice", { $ifNull: ["$advancePayment", 0] }] }, 2] },
        } },
        { $match: { balance: { $gt: 0 } } },
        { $facet: {
            summary: [{ $group: {
                _id: null,
                open: { $sum: 1 },
                departed: countIf({ $lt: ["$travelStartDate", start] }),
                next30: countIf({ $and: [
                    { $gte: ["$travelStartDate", start] },
                    { $lt: ["$travelStartDate", laterStart] },
                ] }),
                later: countIf({ $gte: ["$travelStartDate", laterStart] }),
                overdue: countIf({ $and: [dueExists, { $lt: ["$paymentDueDate", start] }] }),
                due7: countIf({ $and: [dueExists, { $gte: ["$paymentDueDate", start] }, { $lt: ["$paymentDueDate", nextWeek] }] }),
                scheduledLater: countIf({ $gte: ["$paymentDueDate", nextWeek] }),
                unscheduled: countIf({ $eq: ["$paymentDueDate", null] }),
            } }],
            total: [...selected, { $count: "value" }],
            items: [
                ...selected,
                { $addFields: { dueMissing: { $cond: [{ $eq: ["$paymentDueDate", null] }, 1, 0] } } },
                { $sort: { dueMissing: 1, paymentDueDate: 1, travelStartDate: 1, bookingCode: 1, _id: 1 } },
                { $skip: (page - 1) * PAGE_SIZE },
                { $limit: PAGE_SIZE },
                { $project: { dueMissing: 0 } },
            ],
        } },
    ];
};

module.exports = { buildOutstandingBalancesPipeline, DATE_FILTERS, DUE_FILTERS, PAGE_SIZE };
