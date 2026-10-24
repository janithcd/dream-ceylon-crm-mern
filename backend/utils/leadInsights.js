const { getBusinessDayBounds } = require("./businessDate");

const WINDOWS = Object.freeze(["30", "90", "365", "all"]);
const DAY_MS = 24 * 60 * 60 * 1000;

const buildLeadInsightsPipeline = (window, now = new Date()) => {
    if (!WINDOWS.includes(window)) {
        throw new Error("Choose a valid insights period.");
    }

    const { start } = getBusinessDayBounds(now);
    const match = window === "all" ? {} : {
        createdAt: {
            $gte: new Date(start.getTime() - (Number(window) - 1) * DAY_MS),
            $lt: new Date(start.getTime() + DAY_MS),
        },
    };

    return [
        { $match: match },
        {
            $lookup: {
                from: "bookings",
                localField: "_id",
                foreignField: "inquiry",
                pipeline: [{ $project: { _id: 1 } }, { $limit: 1 }],
                as: "linkedBookings",
            },
        },
        {
            $project: {
                source: { $ifNull: ["$source", "Unknown"] },
                status: 1,
                lossReason: 1,
                booked: { $gt: [{ $size: "$linkedBookings" }, 0] },
            },
        },
        {
            $facet: {
                sources: [
                    {
                        $group: {
                            _id: "$source",
                            inquiries: { $sum: 1 },
                            booked: { $sum: { $cond: ["$booked", 1, 0] } },
                            lost: {
                                $sum: {
                                    $cond: [{ $and: [{ $eq: ["$status", "Cancelled"] }, { $not: ["$booked"] }] }, 1, 0],
                                },
                            },
                        },
                    },
                    { $sort: { inquiries: -1, _id: 1 } },
                ],
                reasons: [
                    { $match: { status: "Cancelled", booked: false } },
                    { $group: { _id: { $ifNull: ["$lossReason", "Unspecified"] }, count: { $sum: 1 } } },
                    { $sort: { count: -1, _id: 1 } },
                ],
            },
        },
    ];
};

const summarizeLeadInsights = (result = {}) => {
    const sources = (result.sources || []).map((row) => ({
        source: row._id || "Unknown",
        inquiries: row.inquiries,
        booked: row.booked,
        lost: row.lost,
        conversionRate: row.inquiries ? Math.round(row.booked * 1000 / row.inquiries) / 10 : 0,
    }));
    const summary = sources.reduce((totals, row) => ({
        inquiries: totals.inquiries + row.inquiries,
        booked: totals.booked + row.booked,
        lost: totals.lost + row.lost,
    }), { inquiries: 0, booked: 0, lost: 0 });

    return {
        summary: {
            ...summary,
            conversionRate: summary.inquiries ? Math.round(summary.booked * 1000 / summary.inquiries) / 10 : 0,
        },
        sources,
        reasons: (result.reasons || []).map((row) => ({ reason: row._id || "Unspecified", count: row.count })),
    };
};

module.exports = { WINDOWS, buildLeadInsightsPipeline, summarizeLeadInsights };
