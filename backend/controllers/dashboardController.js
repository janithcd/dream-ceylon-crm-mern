const Destination = require("../models/Destination");
const TourPackage = require("../models/TourPackage");
const Inquiry = require("../models/Inquiry");
const Booking = require("../models/Booking");
const Vehicle = require("../models/Vehicle");


const getDashboardStats = async (req, res) => {
    try {
        const totalDestinations = await Destination.countDocuments();
        const activeDestinations = await Destination.countDocuments({
            status: "Active",
        });

        const totalPackages = await TourPackage.countDocuments();
        const activePackages = await TourPackage.countDocuments({
            status: "Active",
        });
        const totalVehicles = await Vehicle.countDocuments();
        const activeVehicles = await Vehicle.countDocuments({
            status: "Active",
        });

        const totalInquiries = await Inquiry.countDocuments();
        const newInquiries = await Inquiry.countDocuments({ status: "New" });
        const contactedInquiries = await Inquiry.countDocuments({
            status: "Contacted",
        });
        const followUpInquiries = await Inquiry.countDocuments({
            status: "Follow Up",
        });
        const convertedInquiries = await Inquiry.countDocuments({
            status: "Converted",
        });
        const cancelledInquiries = await Inquiry.countDocuments({
            status: "Cancelled",
        });
        const highPriorityInquiries = await Inquiry.countDocuments({
            priority: "High",
        });

        const totalBookings = await Booking.countDocuments();
        const pendingBookings = await Booking.countDocuments({
            bookingStatus: "Pending",
        });
        const confirmedBookings = await Booking.countDocuments({
            bookingStatus: "Confirmed",
        });
        const inProgressBookings = await Booking.countDocuments({
            bookingStatus: "In Progress",
        });
        const completedBookings = await Booking.countDocuments({
            bookingStatus: "Completed",
        });
        const cancelledBookings = await Booking.countDocuments({
            bookingStatus: "Cancelled",
        });

        const pendingPayments = await Booking.countDocuments({
            paymentStatus: "Pending",
        });
        const partiallyPaidPayments = await Booking.countDocuments({
            paymentStatus: "Partially Paid",
        });
        const paidPayments = await Booking.countDocuments({
            paymentStatus: "Paid",
        });

        const revenueStats = await Booking.aggregate([
            {
                $match: {
                    bookingStatus: { $ne: "Cancelled" },
                    currency: "USD",
                },
            },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: "$totalPrice" },
                    totalAdvancePayments: { $sum: "$advancePayment" },
                    bookingCount: { $sum: 1 },
                },
            },
        ]);

        const revenueSummary = revenueStats[0] || {
            totalRevenue: 0,
            totalAdvancePayments: 0,
            bookingCount: 0,
        };

        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
        sixMonthsAgo.setDate(1);
        sixMonthsAgo.setHours(0, 0, 0, 0);

        const monthlyBookingStats = await Booking.aggregate([
            {
                $match: {
                    createdAt: { $gte: sixMonthsAgo },
                    bookingStatus: { $ne: "Cancelled" },
                    currency: "USD",
                },
            },
            {
                $group: {
                    _id: {
                        year: { $year: "$createdAt" },
                        month: { $month: "$createdAt" },
                    },
                    totalBookings: { $sum: 1 },
                    totalRevenue: { $sum: "$totalPrice" },
                },
            },
            {
                $sort: {
                    "_id.year": 1,
                    "_id.month": 1,
                },
            },
        ]);

        const recentInquiries = await Inquiry.find()
            .populate("interestedPackage", "title durationDays category priceFrom currency")
            .sort({ createdAt: -1 })
            .limit(5);

        const recentBookings = await Booking.find()
            .populate("selectedPackage", "title durationDays category priceFrom currency")
            .sort({ createdAt: -1 })
            .limit(5);

        res.status(200).json({
            destinations: {
                total: totalDestinations,
                active: activeDestinations,
            },

            packages: {
                total: totalPackages,
                active: activePackages,
            },
            vehicles: {
                total: totalVehicles,
                active: activeVehicles,
            },


            inquiries: {
                total: totalInquiries,
                new: newInquiries,
                contacted: contactedInquiries,
                followUp: followUpInquiries,
                converted: convertedInquiries,
                cancelled: cancelledInquiries,
                highPriority: highPriorityInquiries,
            },

            bookings: {
                total: totalBookings,
                pending: pendingBookings,
                confirmed: confirmedBookings,
                inProgress: inProgressBookings,
                completed: completedBookings,
                cancelled: cancelledBookings,
            },

            payments: {
                pending: pendingPayments,
                partiallyPaid: partiallyPaidPayments,
                paid: paidPayments,
            },

            revenue: {
                currency: "USD",
                totalRevenue: revenueSummary.totalRevenue,
                totalAdvancePayments: revenueSummary.totalAdvancePayments,
                balanceAmount:
                    revenueSummary.totalRevenue - revenueSummary.totalAdvancePayments,
            },

            monthlyBookingStats,

            recentInquiries,

            recentBookings,
        });
    } catch (error) {
        res.status(500).json({
            message: "Server error",
            error: error.message,
        });
    }
};

module.exports = {
    getDashboardStats,
};