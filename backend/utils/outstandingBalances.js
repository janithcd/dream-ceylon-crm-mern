const { getBusinessDayBounds } = require("./businessDate");

const DATE_FILTERS = ["next30", "departed", "later", "all"];
const DUE_FILTERS = ["all", "overdue", "due7", "later", "unscheduled"];
const CONTACT_FILTERS = ["all", "due"];
const PAGE_SIZE = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_BOOKING_STATUSES = ["Pending", "Confirmed", "In Progress", "Completed"];

const openBalanceStages = () => [
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
        lastContactedAt: { $ifNull: ["$paymentContact.lastContactedAt", null] },
        contactChannel: { $ifNull: ["$paymentContact.channel", null] },
        nextFollowUpDate: { $ifNull: ["$paymentContact.nextFollowUpDate", null] },
        currency: 1,
        totalPrice: 1,
        recordedPaid: { $ifNull: ["$advancePayment", 0] },
        balance: { $round: [{ $subtract: ["$totalPrice", { $ifNull: ["$advancePayment", 0] }] }, 2] },
    } },
    { $match: { balance: { $gt: 0 } } },
];

const buildOutstandingBalancesPipeline = ({ dateFilter = "next30", dueFilter = "all", contactFilter = "all", page = 1 } = {}, now = new Date()) => {
    const { start, end } = getBusinessDayBounds(now);
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
    const contactMatch = contactFilter === "due"
        ? [{ $match: { nextFollowUpDate: { $ne: null, $lte: end } } }]
        : [];
    const selected = [...departureMatch, ...dueMatch, ...contactMatch];

    const countIf = (condition) => ({ $sum: { $cond: [condition, 1, 0] } });
    const dueExists = { $ne: ["$paymentDueDate", null] };

    return [
        ...openBalanceStages(),
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
                followUpsDue: countIf({ $and: [
                    { $ne: ["$nextFollowUpDate", null] },
                    { $lte: ["$nextFollowUpDate", end] },
                ] }),
            } }],
            total: [...selected, { $count: "value" }],
            items: [
                ...selected,
                { $addFields: { dueMissing: { $cond: [{ $eq: ["$paymentDueDate", null] }, 1, 0] } } },
                { $sort: contactFilter === "due"
                    ? { nextFollowUpDate: 1, paymentDueDate: 1, bookingCode: 1, _id: 1 }
                    : { dueMissing: 1, paymentDueDate: 1, travelStartDate: 1, bookingCode: 1, _id: 1 } },
                { $skip: (page - 1) * PAGE_SIZE },
                { $limit: PAGE_SIZE },
                { $project: { dueMissing: 0 } },
            ],
        } },
    ];
};

const buildPaymentAttentionPipeline = (now = new Date()) => {
    const { start, end } = getBusinessDayBounds(now);
    return [
        ...openBalanceStages(),
        { $addFields: {
            followUpDue: { $and: [
                { $ne: ["$nextFollowUpDate", null] },
                { $lte: ["$nextFollowUpDate", end] },
            ] },
            paymentOverdue: { $and: [
                { $ne: ["$paymentDueDate", null] },
                { $lt: ["$paymentDueDate", start] },
            ] },
        } },
        { $match: { $or: [{ followUpDue: true }, { paymentOverdue: true }] } },
        { $facet: {
            summary: [{ $group: {
                _id: null,
                total: { $sum: 1 },
                followUpsDue: { $sum: { $cond: ["$followUpDue", 1, 0] } },
                overdue: { $sum: { $cond: ["$paymentOverdue", 1, 0] } },
            } }],
            items: [
                { $addFields: {
                    rank: { $cond: ["$followUpDue", 0, 1] },
                    attentionDate: { $cond: ["$followUpDue", "$nextFollowUpDate", "$paymentDueDate"] },
                } },
                { $sort: { rank: 1, attentionDate: 1, bookingCode: 1, _id: 1 } },
                { $limit: 5 },
                { $project: {
                    bookingCode: 1, followUpDue: 1, paymentOverdue: 1,
                    nextFollowUpDate: 1, paymentDueDate: 1,
                } },
            ],
        } },
    ];
};

module.exports = { buildOutstandingBalancesPipeline, buildPaymentAttentionPipeline, DATE_FILTERS, DUE_FILTERS, CONTACT_FILTERS, PAGE_SIZE, OPEN_BOOKING_STATUSES };
