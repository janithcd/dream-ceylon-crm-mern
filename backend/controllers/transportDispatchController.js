const Booking = require("../models/Booking");
const { parseTransportDispatchFilters, buildTransportDispatchPipeline, PAGE_SIZE } = require("../utils/transportDispatch");

const getTransportDispatch = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const parsed = parseTransportDispatchFilters(req.query);
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    try {
        const [result] = await Booking.aggregate(buildTransportDispatchPipeline(parsed.value));
        const summary = result?.summary?.[0] || {};
        const total = result?.total?.[0]?.value || 0;
        return res.json({
            items: result?.items || [], total, page: parsed.value.page,
            totalPages: Math.ceil(total / PAGE_SIZE) || 1,
            from: parsed.value.from, to: parsed.value.to,
            summary: {
                total: summary.total || 0, requested: summary.requested || 0,
                attention: summary.attention || 0, missingDriver: summary.missingDriver || 0,
                missingVehicle: summary.missingVehicle || 0, missingPickup: summary.missingPickup || 0,
            },
        });
    } catch (error) {
        console.error("Transport dispatch queue failed:", error.message);
        return res.status(500).json({ message: "Could not load transport dispatch" });
    }
};

module.exports = { getTransportDispatch };
