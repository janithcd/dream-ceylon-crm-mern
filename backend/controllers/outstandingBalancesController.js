const Booking = require("../models/Booking");
const { buildOutstandingBalancesPipeline, DATE_FILTERS, PAGE_SIZE } = require("../utils/outstandingBalances");

const getOutstandingBalances = async (req, res) => {
    const dateFilter = req.query.dateFilter || "next30";
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    if (!DATE_FILTERS.includes(dateFilter) || !Number.isSafeInteger(page) || page < 1 || page > 10000) {
        return res.status(400).json({ message: "Invalid outstanding balance filter or page" });
    }

    try {
        const [result] = await Booking.aggregate(buildOutstandingBalancesPipeline({ dateFilter, page }));
        const summary = result?.summary?.[0] || {};
        const total = result?.total?.[0]?.value || 0;
        return res.status(200).json({
            items: result?.items || [],
            summary: {
                open: summary.open || 0,
                departed: summary.departed || 0,
                next30: summary.next30 || 0,
                later: summary.later || 0,
            },
            total, page, totalPages: Math.ceil(total / PAGE_SIZE) || 1,
        });
    } catch (error) {
        console.error("Outstanding balance queue failed:", error.message);
        return res.status(500).json({ message: "Failed to load outstanding balances" });
    }
};

module.exports = { getOutstandingBalances };
