const Booking = require("../models/Booking");
const BookingPayment = require("../models/BookingPayment");
const { parseReportDateRange, emptySummary, buildCurrencySummaries, buildMonthlyStats } = require("../utils/paymentReportSummary");

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

const buildPaymentQuery = async (queryParams, dateRange) => {
    const {
        keyword,
        status,
        paymentType,
        paymentMethod,
        currency,
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

    const { from, toExclusive } = dateRange;

    if (from || toExclusive) {
        query.paymentDate = {};

        if (from) {
            query.paymentDate.$gte = from;
        }

        if (toExclusive) {
            query.paymentDate.$lt = toExclusive;
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

// @desc    Get payment finance report
// @route   GET /api/finance/reports/payments
// @access  Private
const getPaymentReport = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const currentPage = Number(page);
        const pageLimit = Number(limit);
        const dates = parseReportDateRange(req.query);
        if (dates.error) return res.status(400).json({ message: dates.error });
        if (!Number.isSafeInteger(currentPage) || currentPage < 1 || currentPage > 10000 ||
            !Number.isSafeInteger(pageLimit) || pageLimit < 1 || pageLimit > 10000) {
            return res.status(400).json({ message: "Page must be 1–10000 and limit must be 1–10000." });
        }
        const query = await buildPaymentQuery(req.query, dates.value);

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

        const summaryByCurrency = buildCurrencySummaries(allMatchingPayments);
        const currency = req.query.currency || "";
        const summary = currency
            ? summaryByCurrency.find((item) => item.currency === currency) || emptySummary(currency)
            : null;
        const monthlyStats = currency ? buildMonthlyStats(allMatchingPayments) : [];
        const methodStats = currency ? buildGroupStats(allMatchingPayments, "paymentMethod") : [];
        const typeStats = currency ? buildGroupStats(allMatchingPayments, "paymentType") : [];
        const statusStats = buildGroupStats(allMatchingPayments, "status")
            .map(({ name, count }) => ({ name, count }));

        const recentPayments = allMatchingPayments.slice(0, 5);

        res.status(200).json({
            summary,
            summaryByCurrency,
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
        console.error("Payment report failed:", error.message);
        res.status(500).json({
            message: "Failed to load payment report",
        });
    }
};

module.exports = {
    getPaymentReport,
};
