const Booking = require("../models/Booking");
const { buildTeamTasksPipeline, ASSIGNMENT_FILTERS, DATE_FILTERS, PRIORITY_FILTERS, PAGE_SIZE } = require("../utils/teamTasks");

const getTeamTasks = async (req, res) => {
    const assignment = req.query.assignment || "unassigned";
    const dateFilter = req.query.dateFilter || "all";
    const priorityFilter = req.query.priorityFilter || "all";
    const page = req.query.page === undefined ? 1 : Number(req.query.page);

    if (!ASSIGNMENT_FILTERS.includes(assignment) ||
        !DATE_FILTERS.includes(dateFilter) ||
        !PRIORITY_FILTERS.includes(priorityFilter) ||
        !Number.isSafeInteger(page) || page < 1 || page > 10000) {
        return res.status(400).json({ message: "Invalid team task filters or page" });
    }

    try {
        const [result] = await Booking.aggregate(buildTeamTasksPipeline({ assignment, dateFilter, priorityFilter, page }));
        const summary = result?.summary?.[0] || {
            open: 0, unassigned: 0, assigned: 0, high: 0, overdue: 0, today: 0, upcoming: 0, noDue: 0,
        };
        const total = result?.total?.[0]?.value || 0;
        return res.status(200).json({
            items: result?.items || [],
            summary: {
                open: summary.open, unassigned: summary.unassigned, assigned: summary.assigned,
                high: summary.high, overdue: summary.overdue, today: summary.today,
                upcoming: summary.upcoming, noDue: summary.noDue,
            },
            total, page,
            totalPages: Math.ceil(total / PAGE_SIZE) || 1,
        });
    } catch (error) {
        return res.status(500).json({ message: "Failed to load team tasks" });
    }
};

module.exports = { getTeamTasks };
