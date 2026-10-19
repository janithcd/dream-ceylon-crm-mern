const { getBusinessDayBounds } = require("./businessDate");

const DATE_FILTERS = ["next30", "departed", "later", "all"];
const PAGE_SIZE = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_BOOKING_STATUSES = ["Pending", "Confirmed", "In Progress", "Completed"];

const buildOutstandingBalancesPipeline = ({ dateFilter = "next30", page = 1 } = {}, now = new Date()) => {
    const { start } = getBusinessDayBounds(now);
    const laterStart = new Date(start.getTime() + 30 * DAY_MS);
    const selected = dateFilter === "departed"
        ? [{ $match: { travelStartDate: { $lt: start } } }]
        : dateFilter === "next30"
            ? [{ $match: { travelStartDate: { $gte: start, $lt: laterStart } } }]
            : dateFilter === "later"
                ? [{ $match: { travelStartDate: { $gte: laterStart } } }]
                : [];

    const countIf = (condition) => ({ $sum: { $cond: [condition, 1, 0] } });

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
            } }],
            total: [...selected, { $count: "value" }],
            items: [
                ...selected,
                { $sort: { travelStartDate: dateFilter === "departed" ? -1 : 1, bookingCode: 1, _id: 1 } },
                { $skip: (page - 1) * PAGE_SIZE },
                { $limit: PAGE_SIZE },
            ],
        } },
    ];
};

module.exports = { buildOutstandingBalancesPipeline, DATE_FILTERS, PAGE_SIZE };
