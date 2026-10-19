const Booking = require("../models/Booking");
const { buildSupplierConfirmationsPipeline, TYPES, DATE_FILTERS, PAGE_SIZE } = require("../utils/supplierConfirmations");

const getSupplierConfirmations = async (req, res) => {
    const type = req.query.type || "all";
    const dateFilter = req.query.dateFilter || "all";
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    if (!TYPES.includes(type) || !DATE_FILTERS.includes(dateFilter) ||
        !Number.isSafeInteger(page) || page < 1 || page > 10000) {
        return res.status(400).json({ message: "Invalid supplier confirmation filters or page" });
    }

    try {
        const [result] = await Booking.aggregate(buildSupplierConfirmationsPipeline({ type, dateFilter, page }));
        const summary = result?.summary?.[0] || {};
        const total = result?.total?.[0]?.value || 0;
        return res.status(200).json({
            items: result?.items || [],
            summary: {
                open: summary.open || 0, hotels: summary.hotels || 0, transport: summary.transport || 0,
                overdue: summary.overdue || 0, today: summary.today || 0, noDue: summary.noDue || 0,
            },
            total, page, totalPages: Math.ceil(total / PAGE_SIZE) || 1,
        });
    } catch (error) {
        console.error("Supplier confirmation queue failed:", error.message);
        return res.status(500).json({ message: "Failed to load supplier confirmations" });
    }
};

module.exports = { getSupplierConfirmations };
