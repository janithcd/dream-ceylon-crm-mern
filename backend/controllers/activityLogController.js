const ActivityLog = require("../models/ActivityLog");

const safeText = (value) => {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
};

const escapeRegex = (value) => {
    return safeText(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const buildRegex = (value) => {
    return {
        $regex: escapeRegex(value),
        $options: "i",
    };
};

const parsePositiveInteger = (value, fallback) => {
    const number = Number.parseInt(value, 10);

    if (!Number.isFinite(number) || number < 1) {
        return fallback;
    }

    return number;
};

const getStartDate = (value) => {
    if (!value) {
        return null;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    date.setHours(0, 0, 0, 0);
    return date;
};

const getEndDate = (value) => {
    if (!value) {
        return null;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    date.setHours(23, 59, 59, 999);
    return date;
};

const buildActivityLogQuery = (queryParams) => {
    const {
        keyword,
        action,
        module,
        status,
        admin,
        dateFrom,
        dateTo,
    } = queryParams;

    const query = {};

    if (action) {
        query.action = action;
    }

    if (module) {
        query.module = module;
    }

    if (status) {
        query.status = status;
    }

    if (admin) {
        query.$or = [
            {
                adminName: buildRegex(admin),
            },
            {
                adminEmail: buildRegex(admin),
            },
        ];
    }

    if (keyword) {
        const keywordConditions = [
            {
                description: buildRegex(keyword),
            },
            {
                customerName: buildRegex(keyword),
            },
            {
                referenceNo: buildRegex(keyword),
            },
            {
                adminName: buildRegex(keyword),
            },
            {
                adminEmail: buildRegex(keyword),
            },
            {
                relatedModel: buildRegex(keyword),
            },
        ];

        if (query.$or) {
            query.$and = [
                {
                    $or: query.$or,
                },
                {
                    $or: keywordConditions,
                },
            ];

            delete query.$or;
        } else {
            query.$or = keywordConditions;
        }
    }

    const startDate = getStartDate(dateFrom);
    const endDate = getEndDate(dateTo);

    if (startDate || endDate) {
        query.createdAt = {};

        if (startDate) {
            query.createdAt.$gte = startDate;
        }

        if (endDate) {
            query.createdAt.$lte = endDate;
        }
    }

    return query;
};

// @desc    Get activity logs
// @route   GET /api/activity-logs
// @access  Private
const getActivityLogs = async (req, res) => {
    try {
        const page = parsePositiveInteger(req.query.page, 1);
        const limit = Math.min(
            parsePositiveInteger(req.query.limit, 20),
            100
        );

        const skip = (page - 1) * limit;
        const query = buildActivityLogQuery(req.query);

        const [logs, totalLogs] = await Promise.all([
            ActivityLog.find(query)
                .populate("admin", "name email")
                .sort({
                    createdAt: -1,
                })
                .skip(skip)
                .limit(limit),

            ActivityLog.countDocuments(query),
        ]);

        res.status(200).json({
            logs,
            currentPage: page,
            totalPages: Math.ceil(totalLogs / limit) || 1,
            totalLogs,
            limit,
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to load activity logs",
            error: error.message,
        });
    }
};

// @desc    Get one activity log
// @route   GET /api/activity-logs/:id
// @access  Private
const getActivityLogById = async (req, res) => {
    try {
        const log = await ActivityLog.findById(req.params.id).populate(
            "admin",
            "name email"
        );

        if (!log) {
            return res.status(404).json({
                message: "Activity log not found",
            });
        }

        return res.status(200).json(log);
    } catch (error) {
        return res.status(500).json({
            message: "Failed to load activity log",
            error: error.message,
        });
    }
};

// @desc    Get activity log summary
// @route   GET /api/activity-logs/summary
// @access  Private
const getActivityLogSummary = async (req, res) => {
    try {
        const now = new Date();

        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);

        const sevenDaysAgo = new Date(todayStart);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

        const thirtyDaysAgo = new Date(todayStart);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);

        const [
            totalActivities,
            todayActivities,
            lastSevenDaysActivities,
            lastThirtyDaysActivities,
            failedActivities,
            moduleStats,
            actionStats,
            recentActivities,
        ] = await Promise.all([
            ActivityLog.countDocuments(),

            ActivityLog.countDocuments({
                createdAt: {
                    $gte: todayStart,
                },
            }),

            ActivityLog.countDocuments({
                createdAt: {
                    $gte: sevenDaysAgo,
                },
            }),

            ActivityLog.countDocuments({
                createdAt: {
                    $gte: thirtyDaysAgo,
                },
            }),

            ActivityLog.countDocuments({
                status: "Failed",
            }),

            ActivityLog.aggregate([
                {
                    $group: {
                        _id: "$module",
                        count: {
                            $sum: 1,
                        },
                    },
                },
                {
                    $sort: {
                        count: -1,
                    },
                },
                {
                    $project: {
                        _id: 0,
                        name: "$_id",
                        count: 1,
                    },
                },
            ]),

            ActivityLog.aggregate([
                {
                    $group: {
                        _id: "$action",
                        count: {
                            $sum: 1,
                        },
                    },
                },
                {
                    $sort: {
                        count: -1,
                    },
                },
                {
                    $project: {
                        _id: 0,
                        name: "$_id",
                        count: 1,
                    },
                },
            ]),

            ActivityLog.find()
                .populate("admin", "name email")
                .sort({
                    createdAt: -1,
                })
                .limit(10),
        ]);

        res.status(200).json({
            summary: {
                totalActivities,
                todayActivities,
                lastSevenDaysActivities,
                lastThirtyDaysActivities,
                failedActivities,
            },
            moduleStats,
            actionStats,
            recentActivities,
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to load activity log summary",
            error: error.message,
        });
    }
};

module.exports = {
    getActivityLogs,
    getActivityLogById,
    getActivityLogSummary,
};