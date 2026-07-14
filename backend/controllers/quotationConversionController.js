const mongoose = require("mongoose");
const Quotation = require("../models/Quotation");
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
        .populate("inquiry", "fullName email whatsappNumber country status")
        .populate(
            "selectedPackage",
            "title durationDays category overview priceFrom currency"
        );
};

// @desc    Convert quotation to booking
// @route   POST /api/quotations/:id/convert-to-booking
// @access  Private
const convertQuotationToBooking = async (req, res) => {
    try {
        const quotation = await Quotation.findById(req.params.id)
            .populate(
                "inquiry",
                "fullName email whatsappNumber country status interestedPackage numberOfTravelers travelDate"
            )
            .populate("booking", "bookingCode");

        if (!quotation) {
            return res.status(404).json({
                message: "Quotation not found",
            });
        }

        if (quotation.booking) {
            return res.status(400).json({
                message: `Quotation has already been converted to booking ${quotation.booking.bookingCode || ""}`.trim(),
                bookingId: quotation.booking._id,
            });
        }

        if (quotation.status !== "Accepted" && !req.body.confirmAccepted) {
            return res.status(400).json({
                message:
                    "Quotation must be accepted before conversion. Send confirmAccepted: true to confirm acceptance.",
            });
        }

        const inquiry = quotation.inquiry || null;
        const totalPrice = Math.max(
            toNumber(quotation.totals?.grandTotal),
            0
        );
        const advancePayment = Math.min(
            Math.max(
                toNumber(
                    quotation.totals?.advancePayment ?? quotation.advancePayment
                ),
                0
            ),
            totalPrice
        );

        const customer = {
            fullName:
                safeText(req.body.fullName) ||
                safeText(quotation.clientName) ||
                safeText(inquiry?.fullName),
            email: safeText(req.body.email) || safeText(inquiry?.email),
            whatsappNumber:
                safeText(req.body.whatsappNumber) ||
                safeText(inquiry?.whatsappNumber),
            country:
                safeText(req.body.country) ||
                safeText(quotation.country) ||
                safeText(inquiry?.country),
        };

        if (!customer.fullName) {
            return res.status(400).json({
                message: "Customer name is required to create the booking",
            });
        }

        const booking = await Booking.create({
            bookingCode: await generateBookingCode(),
            inquiry: normalizeObjectId(inquiry),
            customer,
            selectedPackage:
                normalizeObjectId(req.body.selectedPackage) ||
                normalizeObjectId(inquiry?.interestedPackage),
            travelStartDate:
                req.body.travelStartDate || quotation.travelStartDate || null,
            travelEndDate:
                req.body.travelEndDate || quotation.travelEndDate || null,
            numberOfTravelers: Math.max(
                toNumber(
                    req.body.numberOfTravelers ??
                    quotation.travelers ??
                    inquiry?.numberOfTravelers
                ),
                1
            ),
            vehicleType:
                safeText(req.body.vehicleType) ||
                safeText(quotation.vehicleType) ||
                "Car",
            totalPrice,
            currency:
                safeText(req.body.currency) || safeText(quotation.currency) || "USD",
            advancePayment,
            paymentStatus:
                safeText(req.body.paymentStatus) ||
                calculatePaymentStatus(totalPrice, advancePayment),
            bookingStatus: safeText(req.body.bookingStatus) || "Confirmed",
            specialRequests: safeText(req.body.specialRequests),
            adminNotes:
                safeText(req.body.adminNotes) ||
                `Booking created from quotation ${quotation.quotationNo}.`,
        });

        quotation.booking = booking._id;
        quotation.status = "Accepted";

        const conversionNote = `Converted to booking ${booking.bookingCode}.`;
        quotation.adminNotes = [safeText(quotation.adminNotes), conversionNote]
            .filter(Boolean)
            .join("\n");

        await quotation.save();

        if (inquiry?._id) {
            await Inquiry.findByIdAndUpdate(inquiry._id, {
                status: "Converted",
            });
        }

        await createActivityLog({
            req,
            action: "CONVERT",
            module: "Quotation",
            description: `Quotation ${quotation.quotationNo} was converted to booking ${booking.bookingCode}`,
            relatedRecordId: quotation._id,
            relatedModel: "Quotation",
            referenceNo: quotation.quotationNo,
            customerName: customer.fullName,
            metadata: {
                bookingId: booking._id,
                bookingCode: booking.bookingCode,
                totalPrice: booking.totalPrice,
                currency: booking.currency,
                bookingStatus: booking.bookingStatus,
                paymentStatus: booking.paymentStatus,
                inquiry: inquiry?._id || null,
            },
        });

        await createActivityLog({
            req,
            action: "CREATE",
            module: "Booking",
            description: `Booking ${booking.bookingCode} was created from quotation ${quotation.quotationNo}`,
            relatedRecordId: booking._id,
            relatedModel: "Booking",
            referenceNo: booking.bookingCode,
            customerName: customer.fullName,
            metadata: {
                quotationId: quotation._id,
                quotationNo: quotation.quotationNo,
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
            message: "Quotation converted to booking successfully",
            booking: populatedBooking,
            quotation: {
                _id: quotation._id,
                quotationNo: quotation.quotationNo,
                status: quotation.status,
                booking: booking._id,
            },
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to convert quotation to booking",
            error: error.message,
        });
    }
};

module.exports = {
    convertQuotationToBooking,
};
