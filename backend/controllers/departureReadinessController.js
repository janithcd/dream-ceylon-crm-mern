const Booking = require("../models/Booking");
const { PAGE_SIZE, MESSAGE_FILTERS, REMINDER_DAYS, getDepartureReadinessQuery, summarizeDepartureReadiness } = require("../utils/departureReadiness");

const getPreArrivalAlerts = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
        const query = getDepartureReadinessQuery(new Date(), "due");
        const [count, bookings] = await Promise.all([
            Booking.countDocuments(query),
            Booking.find(query).select("bookingCode travelStartDate")
                .sort({ travelStartDate: 1, _id: 1 }).limit(5).lean(),
        ]);
        return res.json({ count, withinDays: REMINDER_DAYS,
            items: bookings.map((booking) => ({ bookingId: booking._id, bookingCode: booking.bookingCode,
                travelStartDate: booking.travelStartDate })) });
    } catch (error) {
        console.error("Pre-arrival alerts failed:", error.message);
        return res.status(500).json({ message: "Failed to load pre-arrival alerts" });
    }
};

const getDepartureReadiness = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    const message = req.query.message || "all";
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000 || !MESSAGE_FILTERS.includes(message)) {
        return res.status(400).json({ message: "Invalid departure readiness page or message filter" });
    }

    try {
        const query = getDepartureReadinessQuery(new Date(), message);
        const [bookings, total] = await Promise.all([
            Booking.find(query)
                .select("bookingCode customer.fullName travelStartDate bookingStatus preArrivalContact.sentAt preArrivalContact.sentByName preArrivalContact.channel numberOfTravelers travelerNames travelerRosterVersion hotelStays.status hotelStays.rooms hotelStays.roomingPlan transportAssignments.status preparationTasks.completedAt")
                .sort({ travelStartDate: 1, createdAt: 1, _id: 1 })
                .skip((page - 1) * PAGE_SIZE)
                .limit(PAGE_SIZE)
                .lean(),
            Booking.countDocuments(query),
        ]);
        return res.json({
            items: bookings.map(summarizeDepartureReadiness),
            total, page, message, totalPages: Math.ceil(total / PAGE_SIZE) || 1,
        });
    } catch (error) {
        console.error("Departure readiness queue failed:", error.message);
        return res.status(500).json({ message: "Failed to load departure readiness" });
    }
};

module.exports = { getDepartureReadiness, getPreArrivalAlerts };
