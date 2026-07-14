const Booking = require("../models/Booking");
const BookingPayment = require("../models/BookingPayment");

const safeText = (value) => {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
};

const escapeRegex = (value) => {
    return safeText(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const buildRegex = (value) => {
    return {
        $regex: escapeRegex(value),
        $options: "i",
    };
};

const toNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
};

const getStartDate = (value) => {
    if (!value) {
        return null;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    date.setHours(0, 0, 0, 0);
    return date;
};

const getEndDate = (value) => {
    if (!value) {
        return null;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    date.setHours(23, 59, 59, 999);
    return date;
};

const buildPaymentQuery = async (queryParams) => {
    const {
        keyword,
        status,
        paymentType,
        paymentMethod,
        currency,
        dateFrom,
        dateTo,
    } = queryParams;

    const query = {};

    if (status) {
        query.status = status;
    }

    if (paymentType) {
        query.paymentType = paymentType;
    }

    if (paymentMethod) {
        query.paymentMethod = paymentMethod;
    }

    if (currency) {
        query.currency = currency;
    }

    const startDate = getStartDate(dateFrom);
    const endDate = getEndDate(dateTo);

    if (startDate || endDate) {
        query.paymentDate = {};

        if (startDate) {
            query.paymentDate.$gte = startDate;
        }

        if (endDate) {
            query.paymentDate.$lte = endDate;
        }
    }

    if (keyword) {
        const bookingMatches = await Booking.find({
            $or: [
                {
                    bookingCode: buildRegex(keyword),
                },
                {
                    "customer.fullName": buildRegex(keyword),
                },
                {
                    "customer.email": buildRegex(keyword),
                },
                {
                    "customer.whatsappNumber": buildRegex(keyword),
                },
                {
                    "customer.country": buildRegex(keyword),
                },
            ],
        }).select("_id");

        const bookingIds = bookingMatches.map((booking) => booking._id);

        query.$or = [
            {
                paymentNo: buildRegex(keyword),
            },
            {
                referenceNumber: buildRegex(keyword),
            },
            {
                notes: buildRegex(keyword),
            },
        ];

        if (bookingIds.length > 0) {
            query.$or.push({
                booking: {
                    $in: bookingIds,
                },
            });
        }
    }

    return query;
};

const buildMonthlyStats = (payments) => {
    const monthMap = new Map();

    payments.forEach((payment) => {
        const date = new Date(payment.paymentDate);

        if (Number.isNaN(date.getTime())) {
            return;
        }

        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const key = `${year}-${String(month).padStart(2, "0")}`;

        if (!monthMap.has(key)) {
            monthMap.set(key, {
                key,
                year,
                month,
                label: date.toLocaleString("en-US", {
                    month: "short",
                    year: "numeric",
                }),
                received: 0,
                refunded: 0,
                cancelled: 0,
                net: 0,
                count: 0,
            });
        }

        const row = monthMap.get(key);
        const amount = toNumber(payment.amount);

        row.count += 1;

        if (payment.status === "Received") {
            row.received += amount;
            row.net += amount;
        } else if (payment.status === "Refunded") {
            row.refunded += amount;
            row.net -= amount;
        } else if (payment.status === "Cancelled") {
            row.cancelled += amount;
        }
    });

    return Array.from(monthMap.values()).sort((a, b) =>
        a.key.localeCompare(b.key)
    );
};

const buildGroupStats = (payments, fieldName) => {
    const groupMap = new Map();

    payments.forEach((payment) => {
        const key = payment[fieldName] || "Unknown";

        if (!groupMap.has(key)) {
            groupMap.set(key, {
                name: key,
                received: 0,
                refunded: 0,
                cancelled: 0,
                net: 0,
                count: 0,
            });
        }

        const row = groupMap.get(key);
        const amount = toNumber(payment.amount);

        row.count += 1;

        if (payment.status === "Received") {
            row.received += amount;
            row.net += amount;
        } else if (payment.status === "Refunded") {
            row.refunded += amount;
            row.net -= amount;
        } else if (payment.status === "Cancelled") {
            row.cancelled += amount;
        }
    });

    return Array.from(groupMap.values()).sort((a, b) => b.net - a.net);
};

const buildSummary = (payments) => {
    const summary = {
        totalPayments: payments.length,
        receivedCount: 0,
        refundedCount: 0,
        cancelledCount: 0,
        totalReceived: 0,
        totalRefunded: 0,
        totalCancelled: 0,
        netIncome: 0,
        currency: payments[0]?.currency || "USD",
    };

    payments.forEach((payment) => {
        const amount = toNumber(payment.amount);

        if (payment.status === "Received") {
            summary.receivedCount += 1;
            summary.totalReceived += amount;
            summary.netIncome += amount;
        }

        if (payment.status === "Refunded") {
            summary.refundedCount += 1;
            summary.totalRefunded += amount;
            summary.netIncome -= amount;
        }

        if (payment.status === "Cancelled") {
            summary.cancelledCount += 1;
            summary.totalCancelled += amount;
        }
    });

    return summary;
};

// @desc    Get payment finance report
// @route   GET /api/finance/reports/payments
// @access  Private
const getPaymentReport = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;

        const query = await buildPaymentQuery(req.query);

        const currentPage = Number(page);
        const pageLimit = Number(limit);
        const skip = (currentPage - 1) * pageLimit;

        const allMatchingPayments = await BookingPayment.find(query)
            .populate(
                "booking",
                "bookingCode customer totalPrice advancePayment currency paymentStatus bookingStatus travelStartDate travelEndDate"
            )
            .sort({
                paymentDate: -1,
                createdAt: -1,
            });

        const totalPayments = allMatchingPayments.length;

        const payments = allMatchingPayments.slice(skip, skip + pageLimit);

        const summary = buildSummary(allMatchingPayments);
        const monthlyStats = buildMonthlyStats(allMatchingPayments);
        const methodStats = buildGroupStats(allMatchingPayments, "paymentMethod");
        const typeStats = buildGroupStats(allMatchingPayments, "paymentType");
        const statusStats = buildGroupStats(allMatchingPayments, "status");

        const recentPayments = allMatchingPayments.slice(0, 5);

        res.status(200).json({
            summary,
            payments,
            recentPayments,
            monthlyStats,
            methodStats,
            typeStats,
            statusStats,
            currentPage,
            totalPages: Math.ceil(totalPayments / pageLimit) || 1,
            totalPayments,
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to load payment report",
            error: error.message,
        });
    }
};

module.exports = {
    getPaymentReport,
};