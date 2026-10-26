const Booking = require("../models/Booking");
const { PERMISSIONS } = require("../config/permissions");
const { FILTERS, PAGE_SIZE, buildCancellationReviewPipeline } = require("../utils/cancellationReview");

const getCancellationReview = async (req, res) => {
    const filter = req.query.filter ?? "open";
    const rawPage = req.query.page ?? "1";
    if (!FILTERS.includes(filter) || typeof rawPage !== "string" ||
        !/^[1-9]\d*$/.test(rawPage) || Number(rawPage) > 1000) {
        return res.status(400).json({ message: "Choose a valid cancellation filter and page (1–1000)." });
    }
    const page = Number(rawPage);
    const includeFinance = req.adminPermissions.includes(PERMISSIONS.PAYMENT_VIEW) &&
        req.adminPermissions.includes(PERMISSIONS.COST_VIEW);
    try {
        const [result] = await Booking.aggregate(buildCancellationReviewPipeline({ filter, page, includeFinance }));
        const total = result?.total?.[0]?.value || 0;
        res.set("Cache-Control", "no-store");
        return res.json({ filter, page, pageSize: PAGE_SIZE, total,
            pages: Math.ceil(total / PAGE_SIZE),
            summary: { total: result?.summary?.[0]?.total || 0,
                withActiveServices: result?.summary?.[0]?.withActiveServices || 0 },
            items: result?.items || [],
        });
    } catch (error) {
        console.error("Cancellation review failed:", error);
        return res.status(500).json({ message: "Failed to load cancellation review." });
    }
};

module.exports = { getCancellationReview };
