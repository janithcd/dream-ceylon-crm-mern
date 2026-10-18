const { getBusinessDayBounds } = require("./businessDate");
const { ACTIVE_BOOKING_STATUSES, DATE_FILTERS, PRIORITY_FILTERS, PAGE_SIZE } = require("./myTasks");

const ASSIGNMENT_FILTERS = ["all", "unassigned", "assigned"];

const buildTeamTasksPipeline = ({ assignment = "unassigned", dateFilter = "all", priorityFilter = "all", page = 1 } = {}, now = new Date()) => {
    const { start, end } = getBusinessDayBounds(now);
    const taskMatch = {};

    if (assignment === "unassigned") taskMatch.assignedTo = null;
    if (assignment === "assigned") taskMatch.assignedTo = { $ne: null };
    if (priorityFilter === "high") taskMatch.priority = "High";
    if (dateFilter === "overdue") taskMatch.dueDate = { $ne: null, $lt: start };
    if (dateFilter === "today") taskMatch.dueDate = { $gte: start, $lte: end };
    if (dateFilter === "upcoming") taskMatch.dueDate = { $gt: end };
    if (dateFilter === "noDue") taskMatch.dueDate = null;

    const unassigned = { $eq: ["$assignedTo", null] };
    const dueExists = { $ne: ["$dueDate", null] };
    const countIf = (condition) => ({ $sum: { $cond: [condition, 1, 0] } });

    return [
        { $match: {
            bookingStatus: { $in: ACTIVE_BOOKING_STATUSES },
            preparationTasks: { $elemMatch: { completedAt: null } },
        } },
        { $unwind: "$preparationTasks" },
        { $match: { "preparationTasks.completedAt": null } },
        { $project: {
            _id: "$preparationTasks._id",
            bookingId: "$_id",
            bookingCode: 1,
            customerName: "$customer.fullName",
            travelStartDate: 1,
            title: "$preparationTasks.title",
            notes: { $ifNull: ["$preparationTasks.notes", ""] },
            assignedTo: { $ifNull: ["$preparationTasks.assignedTo", null] },
            priority: { $ifNull: ["$preparationTasks.priority", "Normal"] },
            dueDate: { $ifNull: ["$preparationTasks.dueDate", null] },
            createdAt: "$preparationTasks.createdAt",
        } },
        { $facet: {
            summary: [{ $group: {
                _id: null,
                open: { $sum: 1 },
                unassigned: countIf(unassigned),
                assigned: countIf({ $ne: ["$assignedTo", null] }),
                high: countIf({ $eq: ["$priority", "High"] }),
                overdue: countIf({ $and: [dueExists, { $lt: ["$dueDate", start] }] }),
                today: countIf({ $and: [{ $gte: ["$dueDate", start] }, { $lte: ["$dueDate", end] }] }),
                upcoming: countIf({ $gt: ["$dueDate", end] }),
                noDue: countIf({ $eq: ["$dueDate", null] }),
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
                { $sort: { sortDueDate: 1, priorityRank: 1, travelStartDate: 1, createdAt: 1, _id: 1 } },
                { $skip: (page - 1) * PAGE_SIZE },
                { $limit: PAGE_SIZE },
                { $lookup: {
                    from: "admins",
                    localField: "assignedTo",
                    foreignField: "_id",
                    pipeline: [{ $project: { name: 1, role: 1, status: 1 } }],
                    as: "assignee",
                } },
                { $addFields: { assignee: { $first: "$assignee" } } },
                { $project: { sortDueDate: 0, priorityRank: 0, createdAt: 0 } },
            ],
        } },
    ];
};

module.exports = { buildTeamTasksPipeline, ASSIGNMENT_FILTERS, DATE_FILTERS, PRIORITY_FILTERS, PAGE_SIZE };
