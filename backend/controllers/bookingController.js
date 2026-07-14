const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const Inquiry = require("../models/Inquiry");
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

const normalizeObjectId = (value) => {
    const candidate =
        value && typeof value === "object" ? value._id || value.id : value;

    if (!candidate || !mongoose.Types.ObjectId.isValid(candidate)) {
        return null;
    }

    return candidate;
};

const generateBookingCode = async () => {
    const year = new Date().getFullYear();

    for (let attempt = 0; attempt < 10; attempt += 1) {
        const randomPart = Math.floor(100000 + Math.random() * 900000);
        const bookingCode = `DCJ-${year}-${randomPart}`;
        const exists = await Booking.exists({ bookingCode });

        if (!exists) {
            return bookingCode;
        }
    }

    return `DCJ-${year}-${Date.now().toString().slice(-8)}`;
};

const calculatePaymentStatus = (totalPrice, advancePayment) => {
    const total = Math.max(toNumber(totalPrice), 0);
    const advance = Math.max(toNumber(advancePayment), 0);

    if (total > 0 && advance >= total) {
        return "Paid";
    }

    if (advance > 0) {
        return "Partially Paid";
    }

    return "Pending";
};

const populateBooking = (query) => {
    return query
        .populate(
            "inquiry",
            "fullName email whatsappNumber country status travelDate numberOfTravelers interestedPackage"
        )
        .populate(
            "selectedPackage",
            "title durationDays category overview priceFrom currency status"
        );
};

const buildBookingQuery = (queryParams) => {
    const {
        keyword,
        status,
        bookingStatus,
        paymentStatus,
        vehicleType,
    } = queryParams;

    const query = {};
    const resolvedBookingStatus = bookingStatus || status;

    if (resolvedBookingStatus) {
        query.bookingStatus = resolvedBookingStatus;
    }

    if (paymentStatus) {
        query.paymentStatus = paymentStatus;
    }

    if (vehicleType) {
        query.vehicleType = vehicleType;
    }

    if (keyword) {
        query.$or = [
            { bookingCode: buildRegex(keyword) },
            { "customer.fullName": buildRegex(keyword) },
            { "customer.email": buildRegex(keyword) },
            { "customer.whatsappNumber": buildRegex(keyword) },
            { "customer.country": buildRegex(keyword) },
            { specialRequests: buildRegex(keyword) },
            { adminNotes: buildRegex(keyword) },
        ];
    }

    return query;
};

const buildCustomerPayload = (bodyCustomer, existingCustomer = {}) => {
    const source = bodyCustomer || {};

    return {
        fullName:
            source.fullName !== undefined
                ? safeText(source.fullName)
                : safeText(existingCustomer?.fullName),
        email:
            source.email !== undefined
                ? safeText(source.email)
                : safeText(existingCustomer?.email),
        whatsappNumber:
            source.whatsappNumber !== undefined
                ? safeText(source.whatsappNumber)
                : safeText(existingCustomer?.whatsappNumber),
        country:
            source.country !== undefined
                ? safeText(source.country)
                : safeText(existingCustomer?.country),
    };
};

const buildBookingPayload = (body, existingBooking = null) => {
    const totalPrice =
        body.totalPrice !== undefined
            ? Math.max(toNumber(body.totalPrice), 0)
            : Math.max(toNumber(existingBooking?.totalPrice), 0);

    const advancePayment = Math.min(
        body.advancePayment !== undefined
            ? Math.max(toNumber(body.advancePayment), 0)
            : Math.max(toNumber(existingBooking?.advancePayment), 0),
        totalPrice
    );

    const customer = buildCustomerPayload(
        body.customer,
        existingBooking?.customer
    );

    return {
        inquiry:
            body.inquiry !== undefined
                ? normalizeObjectId(body.inquiry)
                : normalizeObjectId(existingBooking?.inquiry),
        customer,
        selectedPackage:
            body.selectedPackage !== undefined
                ? normalizeObjectId(body.selectedPackage)
                : normalizeObjectId(existingBooking?.selectedPackage),
        travelStartDate:
            body.travelStartDate !== undefined
                ? body.travelStartDate || null
                : existingBooking?.travelStartDate || null,
        travelEndDate:
            body.travelEndDate !== undefined
                ? body.travelEndDate || null
                : existingBooking?.travelEndDate || null,
        numberOfTravelers:
            body.numberOfTravelers !== undefined
                ? Math.max(toNumber(body.numberOfTravelers), 1)
                : Math.max(toNumber(existingBooking?.numberOfTravelers), 1),
        vehicleType:
            body.vehicleType !== undefined
                ? safeText(body.vehicleType)
                : safeText(existingBooking?.vehicleType) || "Car",
        totalPrice,
        currency:
            body.currency !== undefined
                ? safeText(body.currency)
                : safeText(existingBooking?.currency) || "USD",
        advancePayment,
        paymentStatus:
            body.paymentStatus !== undefined
                ? safeText(body.paymentStatus)
                : calculatePaymentStatus(totalPrice, advancePayment),
        bookingStatus:
            body.bookingStatus !== undefined
                ? safeText(body.bookingStatus)
                : safeText(existingBooking?.bookingStatus) || "Pending",
        specialRequests:
            body.specialRequests !== undefined
                ? safeText(body.specialRequests)
                : safeText(existingBooking?.specialRequests),
        adminNotes:
            body.adminNotes !== undefined
                ? safeText(body.adminNotes)
                : safeText(existingBooking?.adminNotes),
    };
};

const markInquiryConverted = async (inquiryId) => {
    if (!inquiryId) {
        return;
    }

    await Inquiry.findByIdAndUpdate(inquiryId, {
        status: "Converted",
    });
};

// @desc    Create booking
// @route   POST /api/bookings
// @access  Private
const createBooking = async (req, res) => {
    try {
        const payload = buildBookingPayload(req.body);

        if (!payload.customer.fullName) {
            return res.status(400).json({
                message: "Customer name is required",
            });
        }

        payload.bookingCode = await generateBookingCode();

        const booking = await Booking.create(payload);
        await markInquiryConverted(booking.inquiry);

        await createActivityLog({
            req,
            action: "CREATE",
            module: "Booking",
            description: `Booking ${booking.bookingCode} was created for ${booking.customer.fullName}`,
            relatedRecordId: booking._id,
            relatedModel: "Booking",
            referenceNo: booking.bookingCode,
            customerName: booking.customer.fullName,
            metadata: {
                inquiry: booking.inquiry,
                selectedPackage: booking.selectedPackage,
                travelStartDate: booking.travelStartDate,
                travelEndDate: booking.travelEndDate,
                totalPrice: booking.totalPrice,
                currency: booking.currency,
                bookingStatus: booking.bookingStatus,
                paymentStatus: booking.paymentStatus,
            },
        });

        const populatedBooking = await populateBooking(
            Booking.findById(booking._id)
        );

        return res.status(201).json({
            message: "Booking created successfully",
            booking: populatedBooking,
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to create booking",
            error: error.message,
        });
    }
};

// @desc    Get bookings
// @route   GET /api/bookings
// @access  Private
const getBookings = async (req, res) => {
    try {
        const page = parsePositiveInteger(req.query.page, 1);
        const limit = Math.min(parsePositiveInteger(req.query.limit, 10), 10000);
        const skip = (page - 1) * limit;
        const query = buildBookingQuery(req.query);

        const [bookings, totalBookings] = await Promise.all([
            populateBooking(
                Booking.find(query)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
            ),
            Booking.countDocuments(query),
        ]);

        return res.status(200).json({
            bookings,
            currentPage: page,
            totalPages: Math.ceil(totalBookings / limit) || 1,
            totalBookings,
            limit,
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to load bookings",
            error: error.message,
        });
    }
};

// @desc    Get one booking
// @route   GET /api/bookings/:id
// @access  Private
const getBookingById = async (req, res) => {
    try {
        const booking = await populateBooking(Booking.findById(req.params.id));

        if (!booking) {
            return res.status(404).json({
                message: "Booking not found",
            });
        }

        return res.status(200).json(booking);
    } catch (error) {
        return res.status(500).json({
            message: "Failed to load booking",
            error: error.message,
        });
    }
};

// @desc    Update booking
// @route   PUT /api/bookings/:id
// @access  Private
const updateBooking = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);

        if (!booking) {
            return res.status(404).json({
                message: "Booking not found",
            });
        }

        const payload = buildBookingPayload(req.body, booking);

        if (!payload.customer.fullName) {
            return res.status(400).json({
                message: "Customer name is required",
            });
        }

        Object.assign(booking, payload);
        await booking.save();
        await markInquiryConverted(booking.inquiry);

        await createActivityLog({
            req,
            action: "UPDATE",
            module: "Booking",
            description: `Booking ${booking.bookingCode} was updated`,
            relatedRecordId: booking._id,
            relatedModel: "Booking",
            referenceNo: booking.bookingCode,
            customerName: booking.customer.fullName,
            metadata: {
                updatedFields: Object.keys(req.body || {}),
                travelStartDate: booking.travelStartDate,
                travelEndDate: booking.travelEndDate,
                totalPrice: booking.totalPrice,
                advancePayment: booking.advancePayment,
                currency: booking.currency,
                bookingStatus: booking.bookingStatus,
                paymentStatus: booking.paymentStatus,
            },
        });

        const populatedBooking = await populateBooking(
            Booking.findById(booking._id)
        );

        return res.status(200).json({
            message: "Booking updated successfully",
            booking: populatedBooking,
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to update booking",
            error: error.message,
        });
    }
};

// @desc    Delete booking
// @route   DELETE /api/bookings/:id
// @access  Private
const deleteBooking = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);

        if (!booking) {
            return res.status(404).json({
                message: "Booking not found",
            });
        }

        const deletedDetails = {
            id: booking._id,
            bookingCode: booking.bookingCode,
            customerName: booking.customer?.fullName,
            totalPrice: booking.totalPrice,
            advancePayment: booking.advancePayment,
            currency: booking.currency,
            bookingStatus: booking.bookingStatus,
            paymentStatus: booking.paymentStatus,
            inquiry: booking.inquiry,
            selectedPackage: booking.selectedPackage,
        };

        await booking.deleteOne();

        await createActivityLog({
            req,
            action: "DELETE",
            module: "Booking",
            description: `Booking ${deletedDetails.bookingCode} was deleted`,
            relatedRecordId: deletedDetails.id,
            relatedModel: "Booking",
            referenceNo: deletedDetails.bookingCode,
            customerName: deletedDetails.customerName,
            metadata: {
                totalPrice: deletedDetails.totalPrice,
                advancePayment: deletedDetails.advancePayment,
                currency: deletedDetails.currency,
                bookingStatus: deletedDetails.bookingStatus,
                paymentStatus: deletedDetails.paymentStatus,
                inquiry: deletedDetails.inquiry,
                selectedPackage: deletedDetails.selectedPackage,
            },
        });

        return res.status(200).json({
            message: "Booking deleted successfully",
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to delete booking",
            error: error.message,
        });
    }
};

module.exports = {
    createBooking,
    getBookings,
    getBookingById,
    updateBooking,
    deleteBooking,
};
