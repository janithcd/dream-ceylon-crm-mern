const Booking = require("../models/Booking");
const { PAGE_SIZE, getDepartureReadinessQuery, summarizeDepartureReadiness } = require("../utils/departureReadiness");

const getDepartureReadiness = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000) {
        return res.status(400).json({ message: "Invalid departure readiness page" });
    }

    try {
        const query = getDepartureReadinessQuery();
        const [bookings, total] = await Promise.all([
            Booking.find(query)
                .select("bookingCode customer.fullName travelStartDate bookingStatus numberOfTravelers travelerNames travelerRosterVersion hotelStays.status hotelStays.rooms hotelStays.roomingPlan transportAssignments.status preparationTasks.completedAt")
                .sort({ travelStartDate: 1, createdAt: 1, _id: 1 })
                .skip((page - 1) * PAGE_SIZE)
                .limit(PAGE_SIZE)
                .lean(),
            Booking.countDocuments(query),
        ]);
        return res.json({
            items: bookings.map(summarizeDepartureReadiness),
            total, page, totalPages: Math.ceil(total / PAGE_SIZE) || 1,
        });
    } catch (error) {
        console.error("Departure readiness queue failed:", error.message);
        return res.status(500).json({ message: "Failed to load departure readiness" });
    }
};

module.exports = { getDepartureReadiness };
