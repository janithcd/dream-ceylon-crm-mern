const Destination = require("../models/Destination");
const TourPackage = require("../models/TourPackage");
const Inquiry = require("../models/Inquiry");
const Booking = require("../models/Booking");
const Vehicle = require("../models/Vehicle");
const Quotation = require("../models/Quotation");
const { getBusinessMonthStart } = require("../utils/businessDate");
const { getUpcomingDepartureQuery } = require("../utils/upcomingDepartures");
const { getBookingAttentionQuery, summarizeBookingAttention } = require("../utils/bookingAttention");

// @desc    Get dashboard statistics
// @route   GET /api/dashboard/stats
// @access  Private
const getDashboardStats = async (req, res) => {
    try {
        const sixMonthsAgo = getBusinessMonthStart(5);

        const [
            totalDestinations,
            activeDestinations,

            totalPackages,
            activePackages,

            totalVehicles,
            activeVehicles,

            totalInquiries,
            newInquiries,
            followUpInquiries,
            convertedInquiries,

            totalBookings,
            confirmedBookings,
            completedBookings,
            cancelledBookings,

            totalQuotations,
            draftQuotations,
            sentQuotations,
            acceptedQuotations,
            rejectedQuotations,
            expiredQuotations,
            convertedQuotations,
        ] = await Promise.all([
            Destination.countDocuments(),
            Destination.countDocuments({ status: "Active" }),

            TourPackage.countDocuments(),
            TourPackage.countDocuments({ status: "Active" }),

            Vehicle.countDocuments(),
            Vehicle.countDocuments({ status: "Active" }),

            Inquiry.countDocuments(),
            Inquiry.countDocuments({ status: "New" }),
            Inquiry.countDocuments({ status: "Follow Up" }),
            Inquiry.countDocuments({ status: "Converted" }),

            Booking.countDocuments(),
            Booking.countDocuments({ bookingStatus: "Confirmed" }),
            Booking.countDocuments({ bookingStatus: "Completed" }),
            Booking.countDocuments({ bookingStatus: "Cancelled" }),

            Quotation.countDocuments(),
            Quotation.countDocuments({ status: "Draft" }),
            Quotation.countDocuments({ status: "Sent" }),
            Quotation.countDocuments({ status: "Accepted" }),
            Quotation.countDocuments({ status: "Rejected" }),
            Quotation.countDocuments({ status: "Expired" }),
            Quotation.countDocuments({ booking: { $ne: null } }),
        ]);

        const bookingRevenueResult = await Booking.aggregate([
            {
                $match: {
                    currency: "USD",
                },
            },
            {
                $group: {
                    _id: null,
                    totalRevenue: {
                        $sum: {
                            $ifNull: ["$totalPrice", 0],
                        },
                    },
                    totalAdvancePayments: {
                        $sum: {
                            $ifNull: ["$advancePayment", 0],
                        },
                    },
                },
            },
        ]);

        const quotationValueResult = await Quotation.aggregate([
            {
                $match: {
                    currency: "USD",
                },
            },
            {
                $group: {
                    _id: null,

                    totalQuotationValue: {
                        $sum: {
                            $ifNull: ["$totals.grandTotal", 0],
                        },
                    },

                    acceptedQuotationValue: {
                        $sum: {
                            $cond: [
                                {
                                    $eq: ["$status", "Accepted"],
                                },
                                {
                                    $ifNull: ["$totals.grandTotal", 0],
                                },
                                0,
                            ],
                        },
                    },

                    pendingQuotationValue: {
                        $sum: {
                            $cond: [
                                {
                                    $in: ["$status", ["Draft", "Sent"]],
                                },
                                {
                                    $ifNull: ["$totals.grandTotal", 0],
                                },
                                0,
                            ],
                        },
                    },

                    rejectedQuotationValue: {
                        $sum: {
                            $cond: [
                                {
                                    $eq: ["$status", "Rejected"],
                                },
                                {
                                    $ifNull: ["$totals.grandTotal", 0],
                                },
                                0,
                            ],
                        },
                    },
                },
            },
        ]);

        const monthlyBookingStats = await Booking.aggregate([
            {
                $match: {
                    createdAt: {
                        $gte: sixMonthsAgo,
                    },
                },
            },
            {
                $group: {
                    _id: {
                        year: {
                            $year: { date: "$createdAt", timezone: "Asia/Colombo" },
                        },
                        month: {
                            $month: { date: "$createdAt", timezone: "Asia/Colombo" },
                        },
                    },
                    count: {
                        $sum: 1,
                    },
                    revenue: {
                        $sum: {
                            $ifNull: ["$totalPrice", 0],
                        },
                    },
                },
            },
            {
                $sort: {
                    "_id.year": 1,
                    "_id.month": 1,
                },
            },
        ]);

        const monthlyQuotationStats = await Quotation.aggregate([
            {
                $match: {
                    createdAt: {
                        $gte: sixMonthsAgo,
                    },
                },
            },
            {
                $group: {
                    _id: {
                        year: {
                            $year: { date: "$createdAt", timezone: "Asia/Colombo" },
                        },
                        month: {
                            $month: { date: "$createdAt", timezone: "Asia/Colombo" },
                        },
                    },
                    count: {
                        $sum: 1,
                    },
                    value: {
                        $sum: {
                            $ifNull: ["$totals.grandTotal", 0],
                        },
                    },
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
            .populate("interestedPackage", "title durationDays category")
            .sort({ createdAt: -1 })
            .limit(5);

        const recentBookings = await Booking.find()
            .populate("selectedPackage", "title durationDays category")
            .sort({ createdAt: -1 })
            .limit(5);

        const now = new Date();
        const upcomingDepartures = await Booking.find(getUpcomingDepartureQuery(now))
            .select("bookingCode customer.fullName travelStartDate travelEndDate bookingStatus paymentStatus")
            .sort({ travelStartDate: 1, createdAt: 1 })
            .limit(5);

        const attentionQuery = getBookingAttentionQuery(now);
        const [attentionBookings, attentionTotal] = await Promise.all([
            Booking.find(attentionQuery)
                .select("bookingCode customer.fullName travelStartDate hotelStays.status transportAssignments.status preparationTasks.completedAt preparationTasks.dueDate")
                .sort({ travelStartDate: 1, createdAt: 1 })
                .limit(10)
                .lean(),
            Booking.countDocuments(attentionQuery),
        ]);

        const recentQuotations = await Quotation.find()
            .populate("inquiry", "fullName email whatsappNumber country status")
            .populate("booking", "bookingCode bookingStatus paymentStatus")
            .sort({ createdAt: -1 })
            .limit(5);

        const bookingRevenue = bookingRevenueResult[0] || {
            totalRevenue: 0,
            totalAdvancePayments: 0,
        };

        const quotationValues = quotationValueResult[0] || {
            totalQuotationValue: 0,
            acceptedQuotationValue: 0,
            pendingQuotationValue: 0,
            rejectedQuotationValue: 0,
        };

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
                followUp: followUpInquiries,
                converted: convertedInquiries,
            },

            bookings: {
                total: totalBookings,
                confirmed: confirmedBookings,
                completed: completedBookings,
                cancelled: cancelledBookings,
            },

            quotations: {
                total: totalQuotations,
                draft: draftQuotations,
                sent: sentQuotations,
                accepted: acceptedQuotations,
                rejected: rejectedQuotations,
                expired: expiredQuotations,
                converted: convertedQuotations,
            },

            revenue: {
                currency: "USD",
                total: bookingRevenue.totalRevenue || 0,
                totalRevenue: bookingRevenue.totalRevenue || 0,
                totalAdvancePayments: bookingRevenue.totalAdvancePayments || 0,
            },

            quotationValues: {
                currency: "USD",
                total: quotationValues.totalQuotationValue || 0,
                totalQuotationValue: quotationValues.totalQuotationValue || 0,
                acceptedQuotationValue: quotationValues.acceptedQuotationValue || 0,
                pendingQuotationValue: quotationValues.pendingQuotationValue || 0,
                rejectedQuotationValue: quotationValues.rejectedQuotationValue || 0,
            },

            monthlyBookingStats,
            monthlyQuotationStats,

            recentInquiries,
            recentBookings,
            upcomingDepartures,
            bookingAttention: {
                total: attentionTotal,
                items: attentionBookings.map((booking) => summarizeBookingAttention(booking, now)),
            },
            recentQuotations,
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to fetch dashboard statistics",
            error: error.message,
        });
    }
};

module.exports = {
    getDashboardStats,
};
