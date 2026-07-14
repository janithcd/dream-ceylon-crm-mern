const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const BookingPayment = require("../models/BookingPayment");
const { createActivityLog } = require("../utils/createActivityLog");

const safeText = (value) => {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
};

const toNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
};

const escapeRegex = (value) => {
    return safeText(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const buildRegex = (value) => ({
    $regex: escapeRegex(value),
    $options: "i",
});

const parsePositiveInteger = (value, fallback) => {
    const number = Number.parseInt(value, 10);

    if (!Number.isFinite(number) || number < 1) {
        return fallback;
    }

    return number;
};

const isValidObjectId = (value) => {
    const candidate =
        value && typeof value === "object" ? value._id || value.id : value;

    return Boolean(candidate && mongoose.Types.ObjectId.isValid(candidate));
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

const generatePaymentNo = async () => {
    const year = new Date().getFullYear();

    for (let attempt = 0; attempt < 10; attempt += 1) {
        const randomPart = Math.floor(100000 + Math.random() * 900000);
        const paymentNo = `DCJ-PAY-${year}-${randomPart}`;
        const exists = await BookingPayment.exists({ paymentNo });

        if (!exists) {
            return paymentNo;
        }
    }

    return `DCJ-PAY-${year}-${Date.now().toString().slice(-8)}`;
};

const populatePayment = (query) => {
    return query.populate({
        path: "booking",
        select:
            "bookingCode customer selectedPackage travelStartDate travelEndDate totalPrice advancePayment currency paymentStatus bookingStatus",
        populate: {
            path: "selectedPackage",
            select: "title durationDays category",
        },
    });
};

const calculateBookingPaymentStatus = ({
                                           totalPrice,
                                           receivedAmount,
                                           refundedAmount,
                                       }) => {
    const total = Math.max(toNumber(totalPrice), 0);
    const netPaid = Math.max(
        toNumber(receivedAmount) - toNumber(refundedAmount),
        0
    );

    if (refundedAmount > 0 && netPaid === 0) {
        return "Refunded";
    }

    if (total > 0 && netPaid >= total) {
        return "Paid";
    }

    if (netPaid > 0) {
        return "Partially Paid";
    }

    return "Pending";
};

const syncBookingPaymentSummary = async (bookingId) => {
    if (!isValidObjectId(bookingId)) {
        return null;
    }

    const booking = await Booking.findById(bookingId);

    if (!booking) {
        return null;
    }

    const payments = await BookingPayment.find({
        booking: booking._id,
    }).select("amount status");

    let receivedAmount = 0;
    let refundedAmount = 0;

    payments.forEach((payment) => {
        const amount = Math.max(toNumber(payment.amount), 0);

        if (payment.status === "Received") {
            receivedAmount += amount;
        }

        if (payment.status === "Refunded") {
            refundedAmount += amount;
        }
    });

    const netPaidAmount = Math.max(receivedAmount - refundedAmount, 0);
    const totalPrice = Math.max(toNumber(booking.totalPrice), 0);

    booking.advancePayment = Math.min(netPaidAmount, totalPrice || netPaidAmount);
    booking.paymentStatus = calculateBookingPaymentStatus({
        totalPrice,
        receivedAmount,
        refundedAmount,
    });

    await booking.save();

    return booking;
};

const buildPaymentQuery = async (queryParams) => {
    const {
        keyword,
        booking,
        status,
        paymentType,
        paymentMethod,
        currency,
        dateFrom,
        dateTo,
    } = queryParams;

    const query = {};

    if (booking && isValidObjectId(booking)) {
        query.booking = booking;
    }

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
        const matchingBookings = await Booking.find({
            $or: [
                { bookingCode: buildRegex(keyword) },
                { "customer.fullName": buildRegex(keyword) },
                { "customer.email": buildRegex(keyword) },
                { "customer.whatsappNumber": buildRegex(keyword) },
                { "customer.country": buildRegex(keyword) },
            ],
        }).select("_id");

        const bookingIds = matchingBookings.map((item) => item._id);

        query.$or = [
            { paymentNo: buildRegex(keyword) },
            { referenceNumber: buildRegex(keyword) },
            { notes: buildRegex(keyword) },
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

const buildPaymentPayload = (body, existingPayment = null) => {
    const payload = {};

    if (body.booking !== undefined) {
        payload.booking = isValidObjectId(body.booking) ? body.booking : null;
    } else if (existingPayment) {
        payload.booking = existingPayment.booking;
    }

    if (body.amount !== undefined) {
        payload.amount = Math.max(toNumber(body.amount), 0);
    } else if (existingPayment) {
        payload.amount = Math.max(toNumber(existingPayment.amount), 0);
    }

    if (body.currency !== undefined) {
        payload.currency = safeText(body.currency);
    } else if (existingPayment) {
        payload.currency = safeText(existingPayment.currency);
    }

    if (body.paymentDate !== undefined) {
        payload.paymentDate = body.paymentDate || new Date();
    } else if (existingPayment) {
        payload.paymentDate = existingPayment.paymentDate;
    }

    if (body.paymentType !== undefined) {
        payload.paymentType = safeText(body.paymentType);
    } else if (existingPayment) {
        payload.paymentType = safeText(existingPayment.paymentType);
    }

    if (body.paymentMethod !== undefined) {
        payload.paymentMethod = safeText(body.paymentMethod);
    } else if (existingPayment) {
        payload.paymentMethod = safeText(existingPayment.paymentMethod);
    }

    if (body.status !== undefined) {
        payload.status = safeText(body.status);
    } else if (existingPayment) {
        payload.status = safeText(existingPayment.status);
    }

    if (body.referenceNumber !== undefined) {
        payload.referenceNumber = safeText(body.referenceNumber);
    } else if (existingPayment) {
        payload.referenceNumber = safeText(existingPayment.referenceNumber);
    }

    if (body.notes !== undefined) {
        payload.notes = safeText(body.notes);
    } else if (existingPayment) {
        payload.notes = safeText(existingPayment.notes);
    }

    return payload;
};

// @desc    Create booking payment
// @route   POST /api/booking-payments
// @access  Private
const createBookingPayment = async (req, res) => {
    try {
        const payload = buildPaymentPayload(req.body);

        if (!payload.booking) {
            return res.status(400).json({
                message: "Valid booking is required",
            });
        }

        if (payload.amount <= 0) {
            return res.status(400).json({
                message: "Payment amount must be greater than zero",
            });
        }

        const booking = await Booking.findById(payload.booking);

        if (!booking) {
            return res.status(404).json({
                message: "Booking not found",
            });
        }

        payload.paymentNo = await generatePaymentNo();
        payload.currency = payload.currency || booking.currency || "USD";
        payload.paymentDate = payload.paymentDate || new Date();
        payload.paymentType = payload.paymentType || "Advance";
        payload.paymentMethod = payload.paymentMethod || "Cash";
        payload.status = payload.status || "Received";

        const payment = await BookingPayment.create(payload);
        await syncBookingPaymentSummary(booking._id);

        const action =
            payment.status === "Refunded" || payment.paymentType === "Refund"
                ? "REFUND"
                : "CREATE";

        await createActivityLog({
            req,
            action,
            module: "Payment",
            description:
                action === "REFUND"
                    ? `Refund ${payment.paymentNo} was recorded for booking ${booking.bookingCode}`
                    : `Payment ${payment.paymentNo} was added to booking ${booking.bookingCode}`,
            relatedRecordId: payment._id,
            relatedModel: "BookingPayment",
            referenceNo: payment.paymentNo,
            customerName: booking.customer?.fullName,
            metadata: {
                bookingId: booking._id,
                bookingCode: booking.bookingCode,
                amount: payment.amount,
                currency: payment.currency,
                paymentType: payment.paymentType,
                paymentMethod: payment.paymentMethod,
                paymentStatus: payment.status,
                referenceNumber: payment.referenceNumber,
            },
        });

        const populatedPayment = await populatePayment(
            BookingPayment.findById(payment._id)
        );

        return res.status(201).json({
            message:
                action === "REFUND"
                    ? "Refund recorded successfully"
                    : "Payment added successfully",
            payment: populatedPayment,
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to create booking payment",
            error: error.message,
        });
    }
};

// @desc    Get booking payments
// @route   GET /api/booking-payments
// @access  Private
const getBookingPayments = async (req, res) => {
    try {
        const page = parsePositiveInteger(req.query.page, 1);
        const limit = Math.min(parsePositiveInteger(req.query.limit, 20), 10000);
        const skip = (page - 1) * limit;
        const query = await buildPaymentQuery(req.query);

        const [payments, totalPayments] = await Promise.all([
            populatePayment(
                BookingPayment.find(query)
                    .sort({ paymentDate: -1, createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
            ),
            BookingPayment.countDocuments(query),
        ]);

        return res.status(200).json({
            payments,
            currentPage: page,
            totalPages: Math.ceil(totalPayments / limit) || 1,
            totalPayments,
            limit,
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to load booking payments",
            error: error.message,
        });
    }
};

// @desc    Get payments for one booking
// @route   GET /api/booking-payments/booking/:bookingId
// @access  Private
const getBookingPaymentsByBooking = async (req, res) => {
    try {
        if (!isValidObjectId(req.params.bookingId)) {
            return res.status(400).json({
                message: "Invalid booking ID",
            });
        }

        const payments = await populatePayment(
            BookingPayment.find({
                booking: req.params.bookingId,
            }).sort({ paymentDate: -1, createdAt: -1 })
        );

        return res.status(200).json({
            payments,
            totalPayments: payments.length,
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to load booking payment history",
            error: error.message,
        });
    }
};

// @desc    Get one booking payment
// @route   GET /api/booking-payments/:id
// @access  Private
const getBookingPaymentById = async (req, res) => {
    try {
        const payment = await populatePayment(
            BookingPayment.findById(req.params.id)
        );

        if (!payment) {
            return res.status(404).json({
                message: "Payment not found",
            });
        }

        return res.status(200).json(payment);
    } catch (error) {
        return res.status(500).json({
            message: "Failed to load booking payment",
            error: error.message,
        });
    }
};

// @desc    Update booking payment
// @route   PUT /api/booking-payments/:id
// @access  Private
const updateBookingPayment = async (req, res) => {
    try {
        const payment = await BookingPayment.findById(req.params.id);

        if (!payment) {
            return res.status(404).json({
                message: "Payment not found",
            });
        }

        const previousBookingId = payment.booking?.toString();
        const previousStatus = payment.status;
        const payload = buildPaymentPayload(req.body, payment);

        if (!payload.booking) {
            return res.status(400).json({
                message: "Valid booking is required",
            });
        }

        if (payload.amount <= 0) {
            return res.status(400).json({
                message: "Payment amount must be greater than zero",
            });
        }

        const booking = await Booking.findById(payload.booking);

        if (!booking) {
            return res.status(404).json({
                message: "Booking not found",
            });
        }

        Object.assign(payment, payload);
        await payment.save();

        await syncBookingPaymentSummary(previousBookingId);

        if (payment.booking.toString() !== previousBookingId) {
            await syncBookingPaymentSummary(payment.booking);
        }

        const action =
            payment.status === "Refunded" && previousStatus !== "Refunded"
                ? "REFUND"
                : "UPDATE";

        await createActivityLog({
            req,
            action,
            module: "Payment",
            description:
                action === "REFUND"
                    ? `Payment ${payment.paymentNo} was marked as refunded for booking ${booking.bookingCode}`
                    : `Payment ${payment.paymentNo} was updated for booking ${booking.bookingCode}`,
            relatedRecordId: payment._id,
            relatedModel: "BookingPayment",
            referenceNo: payment.paymentNo,
            customerName: booking.customer?.fullName,
            metadata: {
                bookingId: booking._id,
                bookingCode: booking.bookingCode,
                updatedFields: Object.keys(req.body || {}),
                previousStatus,
                currentStatus: payment.status,
                amount: payment.amount,
                currency: payment.currency,
                paymentType: payment.paymentType,
                paymentMethod: payment.paymentMethod,
                referenceNumber: payment.referenceNumber,
            },
        });

        const populatedPayment = await populatePayment(
            BookingPayment.findById(payment._id)
        );

        return res.status(200).json({
            message:
                action === "REFUND"
                    ? "Payment refunded successfully"
                    : "Payment updated successfully",
            payment: populatedPayment,
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to update booking payment",
            error: error.message,
        });
    }
};

// @desc    Delete booking payment
// @route   DELETE /api/booking-payments/:id
// @access  Private
const deleteBookingPayment = async (req, res) => {
    try {
        const payment = await BookingPayment.findById(req.params.id).populate(
            "booking",
            "bookingCode customer"
        );

        if (!payment) {
            return res.status(404).json({
                message: "Payment not found",
            });
        }

        const bookingId = payment.booking?._id || payment.booking;
        const bookingCode = payment.booking?.bookingCode || "";
        const customerName = payment.booking?.customer?.fullName || "";

        const deletedDetails = {
            id: payment._id,
            paymentNo: payment.paymentNo,
            amount: payment.amount,
            currency: payment.currency,
            paymentType: payment.paymentType,
            paymentMethod: payment.paymentMethod,
            status: payment.status,
            referenceNumber: payment.referenceNumber,
        };

        await payment.deleteOne();
        await syncBookingPaymentSummary(bookingId);

        await createActivityLog({
            req,
            action: "DELETE",
            module: "Payment",
            description: `Payment ${deletedDetails.paymentNo} was deleted${
                bookingCode ? ` from booking ${bookingCode}` : ""
            }`,
            relatedRecordId: deletedDetails.id,
            relatedModel: "BookingPayment",
            referenceNo: deletedDetails.paymentNo,
            customerName,
            metadata: {
                bookingId,
                bookingCode,
                amount: deletedDetails.amount,
                currency: deletedDetails.currency,
                paymentType: deletedDetails.paymentType,
                paymentMethod: deletedDetails.paymentMethod,
                paymentStatus: deletedDetails.status,
                referenceNumber: deletedDetails.referenceNumber,
            },
        });

        return res.status(200).json({
            message: "Payment deleted successfully",
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to delete booking payment",
            error: error.message,
        });
    }
};

module.exports = {
    createBookingPayment,
    getBookingPayments,
    getBookingPaymentsByBooking,
    getBookingPaymentById,
    updateBookingPayment,
    deleteBookingPayment,
};
