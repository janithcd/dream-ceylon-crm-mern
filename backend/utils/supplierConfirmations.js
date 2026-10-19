const { getBusinessDayBounds } = require("./businessDate");
const { ACTIVE_BOOKING_STATUSES } = require("./myTasks");

const TYPES = ["all", "hotel", "transport"];
const DATE_FILTERS = ["all", "actionable", "overdue", "today", "upcoming", "noDue"];
const PAGE_SIZE = 20;

const pendingRequests = (field, type, title, serviceDate) => ({
    $map: {
        input: { $filter: {
            input: { $ifNull: [`$${field}`, []] },
            as: "request",
            cond: { $eq: ["$$request.status", "Requested"] },
        } },
        as: "request",
        in: {
            _id: "$$request._id",
            type,
            title: `$$request.${title}`,
            serviceDate: `$$request.${serviceDate}`,
            endDate: type === "hotel" ? "$$request.checkOutDate" : "$$request.endDate",
            detail: type === "hotel" ? "$$request.location" : "$$request.pickupLocation",
            followUpDate: { $ifNull: ["$$request.followUpDate", null] },
            createdAt: "$$request.createdAt",
        },
    },
});

const buildSupplierConfirmationsPipeline = ({ type = "all", dateFilter = "all", page = 1 } = {}, now = new Date()) => {
    const { start, end } = getBusinessDayBounds(now);
    const dueExists = { $ne: ["$followUpDate", null] };
    const countIf = (condition) => ({ $sum: { $cond: [condition, 1, 0] } });
    const filter = {};
    if (type !== "all") filter.type = type;
    if (dateFilter === "actionable") filter.followUpDate = { $ne: null, $lte: end };
    if (dateFilter === "overdue") filter.followUpDate = { $ne: null, $lt: start };
    if (dateFilter === "today") filter.followUpDate = { $gte: start, $lte: end };
    if (dateFilter === "upcoming") filter.followUpDate = { $gt: end };
    if (dateFilter === "noDue") filter.followUpDate = null;
    const selected = Object.keys(filter).length ? [{ $match: filter }] : [];

    return [
        { $match: {
            bookingStatus: { $in: ACTIVE_BOOKING_STATUSES },
            $or: [
                { hotelStays: { $elemMatch: { status: "Requested" } } },
                { transportAssignments: { $elemMatch: { status: "Requested" } } },
            ],
        } },
        { $project: {
            bookingCode: 1, bookingStatus: 1, travelStartDate: 1,
            customerName: "$customer.fullName",
            requests: { $concatArrays: [
                pendingRequests("hotelStays", "hotel", "hotelName", "checkInDate"),
                pendingRequests("transportAssignments", "transport", "route", "startDate"),
            ] },
        } },
        { $unwind: "$requests" },
        { $project: {
            _id: "$requests._id",
            bookingId: "$_id",
            bookingCode: 1, bookingStatus: 1, customerName: 1, travelStartDate: 1,
            type: "$requests.type", title: "$requests.title",
            serviceDate: "$requests.serviceDate", endDate: "$requests.endDate",
            detail: { $ifNull: ["$requests.detail", ""] },
            followUpDate: "$requests.followUpDate", createdAt: "$requests.createdAt",
        } },
        { $facet: {
            summary: [{ $group: {
                _id: null,
                open: { $sum: 1 },
                hotels: countIf({ $eq: ["$type", "hotel"] }),
                transport: countIf({ $eq: ["$type", "transport"] }),
                overdue: countIf({ $and: [dueExists, { $lt: ["$followUpDate", start] }] }),
                today: countIf({ $and: [dueExists, { $gte: ["$followUpDate", start] }, { $lte: ["$followUpDate", end] }] }),
                noDue: countIf({ $eq: ["$followUpDate", null] }),
            } }],
            total: [...selected, { $count: "value" }],
            items: [
                ...selected,
                { $addFields: { sortDate: { $ifNull: ["$followUpDate", "$serviceDate"] } } },
                { $sort: { sortDate: 1, serviceDate: 1, bookingCode: 1, _id: 1 } },
                { $skip: (page - 1) * PAGE_SIZE },
                { $limit: PAGE_SIZE },
                { $project: { sortDate: 0, createdAt: 0 } },
            ],
        } },
    ];
};

module.exports = { buildSupplierConfirmationsPipeline, TYPES, DATE_FILTERS, PAGE_SIZE };
