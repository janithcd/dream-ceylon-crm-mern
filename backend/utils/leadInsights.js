const { getBusinessDayBounds } = require("./businessDate");

const WINDOWS = Object.freeze(["30", "90", "365", "all"]);
const DAY_MS = 24 * 60 * 60 * 1000;

const buildLeadInsightsPipeline = (window, now = new Date()) => {
    if (!WINDOWS.includes(window)) {
        throw new Error("Choose a valid insights period.");
    }

    const { start } = getBusinessDayBounds(now);
    const waitingSince = new Date(now.getTime() - DAY_MS);
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
                // Status edits do not establish when a guest was actually contacted.
                responseMs: { $cond: [
                    { $and: [
                        { $ne: ["$createdAt", null] },
                        { $ne: ["$firstContactAt", null] },
                        { $gte: ["$firstContactAt", "$createdAt"] },
                    ] },
                    { $subtract: ["$firstContactAt", "$createdAt"] },
                    null,
                ] },
                waiting24h: { $and: [
                    { $eq: ["$status", "New"] },
                    { $eq: ["$firstContactAt", null] },
                    { $lte: ["$createdAt", waitingSince] },
                ] },
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
                            firstContacts: { $sum: { $cond: [{ $ne: ["$responseMs", null] }, 1, 0] } },
                            within24h: { $sum: { $cond: [{ $and: [
                                { $ne: ["$responseMs", null] }, { $lte: ["$responseMs", DAY_MS] },
                            ] }, 1, 0] } },
                            responseMsTotal: { $sum: { $ifNull: ["$responseMs", 0] } },
                            waiting24h: { $sum: { $cond: ["$waiting24h", 1, 0] } },
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

const rate = (numerator, denominator) => denominator ? Math.round(numerator * 1000 / denominator) / 10 : null;
const averageHours = (milliseconds, count) => count ? Math.round(milliseconds / count / 360000) / 10 : null;

const summarizeLeadInsights = (result = {}) => {
    const sources = (result.sources || []).map((row) => ({
        source: row._id || "Unknown",
        inquiries: row.inquiries || 0,
        booked: row.booked || 0,
        lost: row.lost || 0,
        conversionRate: row.inquiries ? Math.round(row.booked * 1000 / row.inquiries) / 10 : 0,
        firstContacts: row.firstContacts || 0,
        within24h: row.within24h || 0,
        within24hRate: rate(row.within24h || 0, row.firstContacts || 0),
        averageResponseHours: averageHours(row.responseMsTotal || 0, row.firstContacts || 0),
        waiting24h: row.waiting24h || 0,
    }));
    const totals = (result.sources || []).reduce((totals, row) => ({
        inquiries: totals.inquiries + row.inquiries,
        booked: totals.booked + row.booked,
        lost: totals.lost + row.lost,
        firstContacts: totals.firstContacts + (row.firstContacts || 0),
        within24h: totals.within24h + (row.within24h || 0),
        waiting24h: totals.waiting24h + (row.waiting24h || 0),
        responseMsTotal: totals.responseMsTotal + (row.responseMsTotal || 0),
    }), { inquiries: 0, booked: 0, lost: 0, firstContacts: 0, within24h: 0, waiting24h: 0, responseMsTotal: 0 });

    return {
        summary: {
            inquiries: totals.inquiries, booked: totals.booked, lost: totals.lost,
            conversionRate: totals.inquiries ? Math.round(totals.booked * 1000 / totals.inquiries) / 10 : 0,
            firstContacts: totals.firstContacts,
            within24h: totals.within24h,
            within24hRate: rate(totals.within24h, totals.firstContacts),
            averageResponseHours: averageHours(totals.responseMsTotal, totals.firstContacts),
            waiting24h: totals.waiting24h,
        },
        sources,
        reasons: (result.reasons || []).map((row) => ({ reason: row._id || "Unspecified", count: row.count })),
    };
};

module.exports = { WINDOWS, buildLeadInsightsPipeline, summarizeLeadInsights };
