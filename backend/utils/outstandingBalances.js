const { getBusinessDayBounds } = require("./businessDate");

const DATE_FILTERS = ["next30", "departed", "later", "all"];
const DUE_FILTERS = ["all", "overdue", "due7", "later", "unscheduled"];
const CONTACT_FILTERS = ["all", "due"];
const PAGE_SIZE = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_BOOKING_STATUSES = ["Pending", "Confirmed", "In Progress", "Completed"];
const paid = { $ifNull: ["$advancePayment", 0] };
const hotelTarget = { $ifNull: ["$hotelAdvanceAmount", 0] };
const hotelUnpaid = { $gt: [hotelTarget, paid] };

const openBalanceStages = (now) => {
    const { end } = getBusinessDayBounds(now);
    // Once the final deadline arrives the full open balance is due, even if
    // some of the earlier hotel advance was never collected.
    const collectHotelFirst = { $and: [hotelUnpaid, { $not: [{ $and: [
        { $ne: ["$paymentDueDate", null] },
        { $lte: ["$paymentDueDate", end] },
    ] }] }] };
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
        hotelAdvanceAmount: hotelTarget,
        hotelAdvanceDueDate: { $ifNull: ["$hotelAdvanceDueDate", null] },
        nextPaymentStage: { $cond: [collectHotelFirst, "Hotel advance", "Final balance"] },
        nextPaymentDueDate: { $cond: [collectHotelFirst,
            { $ifNull: ["$hotelAdvanceDueDate", null] },
            { $ifNull: ["$paymentDueDate", null] },
        ] },
        nextPaymentAmount: { $round: [{ $cond: [collectHotelFirst,
            { $subtract: [hotelTarget, paid] },
            { $subtract: ["$totalPrice", paid] },
        ] }, 2] },
        lastContactedAt: { $ifNull: ["$paymentContact.lastContactedAt", null] },
        contactChannel: { $ifNull: ["$paymentContact.channel", null] },
        nextFollowUpDate: { $ifNull: ["$paymentContact.nextFollowUpDate", null] },
        currency: 1,
        totalPrice: 1,
        recordedPaid: paid,
        balance: { $round: [{ $subtract: ["$totalPrice", paid] }, 2] },
    } },
    { $match: { balance: { $gt: 0 } } },
    ];
};

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
        ? [{ $match: { nextPaymentDueDate: { $ne: null, $lt: start } } }]
        : dueFilter === "due7"
            ? [{ $match: { nextPaymentDueDate: { $gte: start, $lt: nextWeek } } }]
            : dueFilter === "later"
                ? [{ $match: { nextPaymentDueDate: { $gte: nextWeek } } }]
                : dueFilter === "unscheduled"
                    ? [{ $match: { nextPaymentDueDate: null } }]
                    : [];
    const contactMatch = contactFilter === "due"
        ? [{ $match: { nextFollowUpDate: { $ne: null, $lte: end } } }]
        : [];
    const selected = [...departureMatch, ...dueMatch, ...contactMatch];

    const countIf = (condition) => ({ $sum: { $cond: [condition, 1, 0] } });
    const dueExists = { $ne: ["$nextPaymentDueDate", null] };

    return [
        ...openBalanceStages(now),
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
                overdue: countIf({ $and: [dueExists, { $lt: ["$nextPaymentDueDate", start] }] }),
                due7: countIf({ $and: [dueExists, { $gte: ["$nextPaymentDueDate", start] }, { $lt: ["$nextPaymentDueDate", nextWeek] }] }),
                scheduledLater: countIf({ $gte: ["$nextPaymentDueDate", nextWeek] }),
                unscheduled: countIf({ $eq: ["$nextPaymentDueDate", null] }),
                followUpsDue: countIf({ $and: [
                    { $ne: ["$nextFollowUpDate", null] },
                    { $lte: ["$nextFollowUpDate", end] },
                ] }),
            } }],
            total: [...selected, { $count: "value" }],
            items: [
                ...selected,
                { $addFields: { dueMissing: { $cond: [{ $eq: ["$nextPaymentDueDate", null] }, 1, 0] } } },
                { $sort: contactFilter === "due"
                    ? { nextFollowUpDate: 1, nextPaymentDueDate: 1, bookingCode: 1, _id: 1 }
                    : { dueMissing: 1, nextPaymentDueDate: 1, travelStartDate: 1, bookingCode: 1, _id: 1 } },
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
        ...openBalanceStages(now),
        { $addFields: {
            followUpDue: { $and: [
                { $ne: ["$nextFollowUpDate", null] },
                { $lte: ["$nextFollowUpDate", end] },
            ] },
            paymentOverdue: { $and: [
                { $ne: ["$nextPaymentDueDate", null] },
                { $lt: ["$nextPaymentDueDate", start] },
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
                    attentionDate: { $cond: ["$followUpDue", "$nextFollowUpDate", "$nextPaymentDueDate"] },
                } },
                { $sort: { rank: 1, attentionDate: 1, bookingCode: 1, _id: 1 } },
                { $limit: 5 },
                { $project: {
                    bookingCode: 1, followUpDue: 1, paymentOverdue: 1,
                    nextFollowUpDate: 1, nextPaymentDueDate: 1,
                    nextPaymentStage: 1, nextPaymentAmount: 1, currency: 1,
                } },
            ],
        } },
    ];
};

module.exports = { buildOutstandingBalancesPipeline, buildPaymentAttentionPipeline, DATE_FILTERS, DUE_FILTERS, CONTACT_FILTERS, PAGE_SIZE, OPEN_BOOKING_STATUSES };
