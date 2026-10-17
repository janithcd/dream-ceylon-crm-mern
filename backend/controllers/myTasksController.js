const Booking = require("../models/Booking");
const { buildMyTasksPipeline, DATE_FILTERS, PRIORITY_FILTERS, PAGE_SIZE } = require("../utils/myTasks");

const getMyTasks = async (req, res) => {
    const status = req.query.status || "open";
    const dateFilter = req.query.dateFilter || "all";
    const priorityFilter = req.query.priorityFilter || "all";
    const page = req.query.page === undefined ? 1 : Number(req.query.page);

    if (!["open", "completed"].includes(status) ||
        !DATE_FILTERS.includes(dateFilter) ||
        !PRIORITY_FILTERS.includes(priorityFilter) ||
        (status === "completed" && (dateFilter !== "all" || priorityFilter !== "all")) ||
        !Number.isSafeInteger(page) || page < 1 || page > 10000) {
        return res.status(400).json({ message: "Invalid task filters or page" });
    }

    try {
        const [result] = await Booking.aggregate(buildMyTasksPipeline(req.admin._id, { status, dateFilter, priorityFilter, page }));
        const summary = result?.summary?.[0] || {
            open: 0, high: 0, completed: 0, overdue: 0, today: 0, upcoming: 0, noDue: 0,
        };
        const total = result?.total?.[0]?.value || 0;
        return res.status(200).json({
            items: result?.items || [],
            summary: {
                open: summary.open, high: summary.high || 0, completed: summary.completed, overdue: summary.overdue,
                today: summary.today, upcoming: summary.upcoming, noDue: summary.noDue,
            },
            total,
            page,
            totalPages: Math.ceil(total / PAGE_SIZE) || 1,
        });
    } catch (error) {
        return res.status(500).json({ message: "Failed to load assigned tasks" });
    }
};

module.exports = { getMyTasks };
