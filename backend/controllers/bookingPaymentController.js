const Booking = require("../models/Booking");
const BookingPayment = require("../models/BookingPayment");

const toNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
};

const safeText = (value) => {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
};

const generatePaymentNo = () => {
    const year = new Date().getFullYear();
    const randomNumber = Math.floor(100000 + Math.random() * 900000);

    return `DCJ-PAY-${year}-${randomNumber}`;
};

const updateBookingPaymentSummary = async (bookingId) => {
    const booking = await Booking.findById(bookingId);

    if (!booking) {
        return null;
    }

    const receivedResult = await BookingPayment.aggregate([
        {
            $match: {
                booking: booking._id,
                status: "Received",
            },
        },
        {
            $group: {
                _id: null,
                totalReceived: {
                    $sum: "$amount",
                },
            },
        },
    ]);

    const refundedResult = await BookingPayment.aggregate([
        {
            $match: {
                booking: booking._id,
                status: "Refunded",
            },
        },
        {
            $group: {
                _id: null,
                totalRefunded: {
                    $sum: "$amount",
                },
            },
        },
    ]);

    const totalReceived = receivedResult[0]?.totalReceived || 0;
    const totalRefunded = refundedResult[0]?.totalRefunded || 0;
    const netPaidAmount = Math.max(totalReceived - totalRefunded, 0);

    booking.advancePayment = netPaidAmount;

    if (booking.totalPrice > 0 && netPaidAmount >= booking.totalPrice) {
        booking.paymentStatus = "Paid";
    } else if (netPaidAmount > 0) {
        booking.paymentStatus = "Partially Paid";
    } else {
        booking.paymentStatus = "Pending";
    }

    await booking.save();

    return booking;
};

// @desc    Add payment to booking
// @route   POST /api/booking-payments
// @access  Private
const createBookingPayment = async (req, res) => {
    try {
        const {
            booking,
            amount,
            currency,
            paymentDate,
            paymentType,
            paymentMethod,
            status,
            referenceNumber,
            notes,
        } = req.body;

        if (!booking) {
            return res.status(400).json({
                message: "Booking ID is required",
            });
        }

        const existingBooking = await Booking.findById(booking);

        if (!existingBooking) {
            return res.status(404).json({
                message: "Booking not found",
            });
        }

        const paymentAmount = toNumber(amount);

        if (paymentAmount <= 0) {
            return res.status(400).json({
                message: "Payment amount must be greater than 0",
            });
        }

        const payment = await BookingPayment.create({
            paymentNo: generatePaymentNo(),
            booking,
            amount: paymentAmount,
            currency: currency || existingBooking.currency || "USD",
            paymentDate: paymentDate || new Date(),
            paymentType: paymentType || "Partial Payment",
            paymentMethod: paymentMethod || "Bank Transfer",
            status: status || "Received",
            referenceNumber: safeText(referenceNumber),
            notes: safeText(notes),
        });

        const updatedBooking = await updateBookingPaymentSummary(booking);

        res.status(201).json({
            message: "Booking payment added successfully",
            payment,
            booking: updatedBooking,
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to add booking payment",
            error: error.message,
        });
    }
};

// @desc    Get all payments
// @route   GET /api/booking-payments
// @access  Private
const getBookingPayments = async (req, res) => {
    try {
        const { keyword, status, paymentType, paymentMethod, page = 1, limit = 10 } =
            req.query;

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

        if (keyword) {
            query.$or = [
                { paymentNo: { $regex: keyword, $options: "i" } },
                { referenceNumber: { $regex: keyword, $options: "i" } },
                { notes: { $regex: keyword, $options: "i" } },
            ];
        }

        const currentPage = Number(page);
        const pageLimit = Number(limit);
        const skip = (currentPage - 1) * pageLimit;

        const totalPayments = await BookingPayment.countDocuments(query);

        const payments = await BookingPayment.find(query)
            .populate(
                "booking",
                "bookingCode customer travelStartDate travelEndDate totalPrice advancePayment paymentStatus bookingStatus"
            )
            .sort({ paymentDate: -1, createdAt: -1 })
            .skip(skip)
            .limit(pageLimit);

        res.status(200).json({
            payments,
            currentPage,
            totalPages: Math.ceil(totalPayments / pageLimit),
            totalPayments,
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to fetch booking payments",
            error: error.message,
        });
    }
};


const getPaymentsByBooking = async (req, res) => {
    try {
        const payments = await BookingPayment.find({
            booking: req.params.bookingId,
        }).sort({ paymentDate: -1, createdAt: -1 });

        const booking = await Booking.findById(req.params.bookingId);

        if (!booking) {
            return res.status(404).json({
                message: "Booking not found",
            });
        }

        res.status(200).json({
            booking,
            payments,
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to fetch booking payment history",
            error: error.message,
        });
    }
};


const getBookingPaymentById = async (req, res) => {
    try {
        const payment = await BookingPayment.findById(req.params.id).populate(
            "booking",
            "bookingCode customer travelStartDate travelEndDate totalPrice advancePayment paymentStatus bookingStatus"
        );

        if (!payment) {
            return res.status(404).json({
                message: "Payment not found",
            });
        }

        res.status(200).json(payment);
    } catch (error) {
        res.status(500).json({
            message: "Failed to fetch payment",
            error: error.message,
        });
    }
};


const updateBookingPayment = async (req, res) => {
    try {
        const payment = await BookingPayment.findById(req.params.id);

        if (!payment) {
            return res.status(404).json({
                message: "Payment not found",
            });
        }

        payment.amount = toNumber(req.body.amount ?? payment.amount);
        payment.currency = req.body.currency || payment.currency;
        payment.paymentDate = req.body.paymentDate || payment.paymentDate;
        payment.paymentType = req.body.paymentType || payment.paymentType;
        payment.paymentMethod = req.body.paymentMethod || payment.paymentMethod;
        payment.status = req.body.status || payment.status;
        payment.referenceNumber = safeText(
            req.body.referenceNumber ?? payment.referenceNumber
        );
        payment.notes = safeText(req.body.notes ?? payment.notes);

        await payment.save();

        const updatedBooking = await updateBookingPaymentSummary(payment.booking);

        res.status(200).json({
            message: "Booking payment updated successfully",
            payment,
            booking: updatedBooking,
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to update booking payment",
            error: error.message,
        });
    }
};


const deleteBookingPayment = async (req, res) => {
    try {
        const payment = await BookingPayment.findById(req.params.id);

        if (!payment) {
            return res.status(404).json({
                message: "Payment not found",
            });
        }

        const bookingId = payment.booking;

        await payment.deleteOne();

        const updatedBooking = await updateBookingPaymentSummary(bookingId);

        res.status(200).json({
            message: "Booking payment deleted successfully",
            booking: updatedBooking,
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to delete booking payment",
            error: error.message,
        });
    }
};

module.exports = {
    createBookingPayment,
    getBookingPayments,
    getPaymentsByBooking,
    getBookingPaymentById,
    updateBookingPayment,
    deleteBookingPayment,
};