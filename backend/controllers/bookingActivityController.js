const mongoose = require("mongoose");
const ActivityLog = require("../models/ActivityLog");
const Booking = require("../models/Booking");
const { PERMISSIONS } = require("../config/permissions");

const PAGE_SIZE = 20;

// @desc    Get operational history for one booking
// @route   GET /api/bookings/:id/activity
// @access  Private, booking.view (payment events also require payment.view)
const getBookingActivity = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: "Invalid booking ID" });
        }

        const bookingId = new mongoose.Types.ObjectId(req.params.id);
        const bookingExists = await Booking.exists({ _id: bookingId });

        if (!bookingExists) {
            return res.status(404).json({ message: "Booking not found" });
        }

        const requestedPage = String(req.query.page || "1");
        const page = /^[1-9]\d*$/.test(requestedPage)
            ? Math.min(Number(requestedPage), 10000)
            : 1;
        const bookingEvents = { relatedModel: "Booking", relatedRecordId: bookingId };

        // Supplier cost changes are logged under Other and require cost.view.
        if (!req.adminPermissions.includes(PERMISSIONS.COST_VIEW)) {
            bookingEvents.module = { $ne: "Other" };
        }

        const relatedEvents = [bookingEvents];

        if (req.adminPermissions.includes(PERMISSIONS.PAYMENT_VIEW)) {
            relatedEvents.push({
                module: "Payment",
                relatedModel: "BookingPayment",
                "metadata.bookingId": bookingId,
            });
        }

        const query = { status: "Success", $or: relatedEvents };
        const [logs, totalLogs] = await Promise.all([
            ActivityLog.find(query)
                .select("action module description adminName createdAt")
                .sort({ createdAt: -1, _id: -1 })
                .skip((page - 1) * PAGE_SIZE)
                .limit(PAGE_SIZE)
                .lean(),
            ActivityLog.countDocuments(query),
        ]);

        return res.status(200).json({
            events: logs.map((log) => ({
                id: log._id,
                action: log.action,
                module: log.module,
                description: log.description,
                actor: log.adminName || "System",
                createdAt: log.createdAt,
            })),
            currentPage: page,
            totalPages: Math.max(Math.ceil(totalLogs / PAGE_SIZE), 1),
            totalEvents: totalLogs,
        });
    } catch (error) {
        return res.status(500).json({ message: "Failed to load booking history" });
    }
};

module.exports = { getBookingActivity };
