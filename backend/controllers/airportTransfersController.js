const Booking = require("../models/Booking");
const { parseTransferFilters, buildAirportTransfersPipeline, PAGE_SIZE } = require("../utils/airportTransfers");

const getAirportTransfers = async (req, res) => {
    const parsed = parseTransferFilters(req.query);
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    try {
        const [result] = await Booking.aggregate(buildAirportTransfersPipeline(parsed.value));
        const summary = result?.summary?.[0] || {};
        const total = result?.total?.[0]?.value || 0;
        return res.json({
            items: result?.items || [],
            summary: {
                requested: summary.requested || 0,
                missingChauffeur: summary.missingChauffeur || 0,
                missingPickupTime: summary.missingPickupTime || 0,
            },
            total,
            page: parsed.value.page,
            totalPages: Math.ceil(total / PAGE_SIZE) || 1,
            startDate: parsed.value.startDate,
            endDate: parsed.value.endDate,
        });
    } catch (error) {
        console.error("Airport transfers error:", error.message);
        return res.status(500).json({ message: "Failed to load airport transfers" });
    }
};

module.exports = { getAirportTransfers };
