const { getBusinessDayBounds } = require("./businessDate");

const ACTIVE_BOOKING_STATUSES = ["Pending", "Confirmed", "In Progress"];
const DATE_FILTERS = ["all", "overdue", "today", "upcoming", "noDue"];
const PRIORITY_FILTERS = ["all", "high"];
const PAGE_SIZE = 20;

const buildMyTasksPipeline = (adminId, { status = "open", dateFilter = "all", priorityFilter = "all", page = 1 } = {}, now = new Date()) => {
    const { start, end } = getBusinessDayBounds(now);
    const taskMatch = { completedAt: status === "open" ? null : { $ne: null } };
    if (status === "open" && priorityFilter === "high") taskMatch.priority = "High";

    if (status === "open") {
        if (dateFilter === "overdue") taskMatch.dueDate = { $ne: null, $lt: start };
        if (dateFilter === "today") taskMatch.dueDate = { $gte: start, $lte: end };
        if (dateFilter === "upcoming") taskMatch.dueDate = { $gt: end };
        if (dateFilter === "noDue") taskMatch.dueDate = null;
    }

    const isOpen = { $eq: ["$completedAt", null] };
    const dueExists = { $ne: ["$dueDate", null] };
    const countIf = (condition) => ({ $sum: { $cond: [condition, 1, 0] } });

    return [
        { $match: {
            bookingStatus: { $in: ACTIVE_BOOKING_STATUSES },
            "preparationTasks.assignedTo": adminId,
        } },
        { $unwind: "$preparationTasks" },
        { $match: { "preparationTasks.assignedTo": adminId } },
        { $project: {
            _id: "$preparationTasks._id",
            bookingId: "$_id",
            bookingCode: 1,
            customerName: "$customer.fullName",
            travelStartDate: 1,
            title: "$preparationTasks.title",
            notes: { $ifNull: ["$preparationTasks.notes", ""] },
            priority: { $ifNull: ["$preparationTasks.priority", "Normal"] },
            dueDate: { $ifNull: ["$preparationTasks.dueDate", null] },
            completedAt: { $ifNull: ["$preparationTasks.completedAt", null] },
            createdAt: "$preparationTasks.createdAt",
        } },
        { $facet: {
            summary: [{ $group: {
                _id: null,
                open: countIf(isOpen),
                high: countIf({ $and: [isOpen, { $eq: ["$priority", "High"] }] }),
                completed: countIf({ $ne: ["$completedAt", null] }),
                overdue: countIf({ $and: [isOpen, dueExists, { $lt: ["$dueDate", start] }] }),
                today: countIf({ $and: [isOpen, { $gte: ["$dueDate", start] }, { $lte: ["$dueDate", end] }] }),
                upcoming: countIf({ $and: [isOpen, { $gt: ["$dueDate", end] }] }),
                noDue: countIf({ $and: [isOpen, { $eq: ["$dueDate", null] }] }),
            } }],
            total: [{ $match: taskMatch }, { $count: "value" }],
            items: [
                { $match: taskMatch },
                { $addFields: {
                    sortDueDate: { $ifNull: ["$dueDate", new Date("9999-12-31T00:00:00.000Z")] },
                    priorityRank: { $switch: {
                        branches: [
                            { case: { $eq: ["$priority", "High"] }, then: 0 },
                            { case: { $eq: ["$priority", "Low"] }, then: 2 },
                        ],
                        default: 1,
                    } },
                } },
                { $sort: status === "open"
                    ? { sortDueDate: 1, priorityRank: 1, travelStartDate: 1, createdAt: 1, _id: 1 }
                    : { completedAt: -1, createdAt: -1, _id: 1 } },
                { $skip: (page - 1) * PAGE_SIZE },
                { $limit: PAGE_SIZE },
                { $project: { sortDueDate: 0, priorityRank: 0, createdAt: 0 } },
            ],
        } },
    ];
};

module.exports = { buildMyTasksPipeline, ACTIVE_BOOKING_STATUSES, DATE_FILTERS, PRIORITY_FILTERS, PAGE_SIZE };
