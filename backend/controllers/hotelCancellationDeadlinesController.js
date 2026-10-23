const Booking = require("../models/Booking");
const { FILTERS, PAGE_SIZE, buildHotelDeadlinePipeline } = require("../utils/hotelCancellationDeadlines");

const getHotelCancellationDeadlines = async (req, res) => {
    const filter = req.query.filter ?? "due7";
    const rawPage = req.query.page ?? "1";
    if (!FILTERS.includes(filter) || typeof rawPage !== "string" || !/^[1-9]\d*$/.test(rawPage) ||
        Number(rawPage) > 1000) {
        return res.status(400).json({ message: "Choose a valid hotel deadline filter and page (1–1000)." });
    }
    const page = Number(rawPage);
    try {
        const [result] = await Booking.aggregate(buildHotelDeadlinePipeline({ filter, page }));
        const summary = result?.summary?.[0] || {};
        const total = result?.total?.[0]?.value || 0;
        return res.json({
            filter, page, pageSize: PAGE_SIZE, total, pages: Math.ceil(total / PAGE_SIZE),
            summary: { total: summary.total || 0, overdue: summary.overdue || 0,
                dueSoon: summary.dueSoon || 0, later: summary.later || 0 },
            items: result?.items || [],
        });
    } catch (error) {
        console.error("Hotel cancellation deadlines failed:", error);
        return res.status(500).json({ message: "Failed to load hotel cancellation deadlines." });
    }
};

module.exports = { getHotelCancellationDeadlines };
