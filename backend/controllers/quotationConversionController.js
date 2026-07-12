const Quotation = require("../models/Quotation");
const Booking = require("../models/Booking");
const Inquiry = require("../models/Inquiry");

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

const getIdValue = (value) => {
    if (!value) {
        return null;
    }

    if (typeof value === "string") {
        return value;
    }

    return value._id || null;
};

const normalizeVehicleType = (vehicleType) => {
    const allowedTypes = ["Car", "SUV", "Van", "Mini Bus", "Other"];

    if (allowedTypes.includes(vehicleType)) {
        return vehicleType;
    }

    return "Other";
};

const resolvePaymentStatus = (advancePayment, totalPrice) => {
    const advance = toNumber(advancePayment);
    const total = toNumber(totalPrice);

    if (total > 0 && advance >= total) {
        return "Paid";
    }

    if (advance > 0) {
        return "Partially Paid";
    }

    return "Pending";
};

// @desc    Convert accepted quotation to booking
// @route   POST /api/quotations/:id/convert-to-booking
// @access  Private
const convertQuotationToBooking = async (req, res) => {
    try {
        const quotation = await Quotation.findById(req.params.id).populate(
            "inquiry",
            "fullName email whatsappNumber country status"
        );

        if (!quotation) {
            return res.status(404).json({
                message: "Quotation not found",
            });
        }

        if (quotation.booking) {
            const existingBooking = await Booking.findById(quotation.booking);

            return res.status(400).json({
                message: "This quotation is already converted to a booking.",
                booking: existingBooking,
            });
        }

        const confirmedAccepted =
            quotation.status === "Accepted" || req.body.confirmAccepted === true;

        if (!confirmedAccepted) {
            return res.status(400).json({
                message:
                    "Please mark this quotation as Accepted before converting it to a booking.",
            });
        }

        if (!quotation.travelStartDate || !quotation.travelEndDate) {
            return res.status(400).json({
                message:
                    "Travel start date and travel end date are required before converting to booking.",
            });
        }

        const inquiryId = getIdValue(quotation.inquiry);

        const email = safeText(req.body.email || quotation.inquiry?.email);
        const whatsappNumber = safeText(
            req.body.whatsappNumber || quotation.inquiry?.whatsappNumber
        );

        if (!email || !whatsappNumber) {
            return res.status(400).json({
                message:
                    "Client email and WhatsApp number are required to create a booking.",
            });
        }

        const totalPrice = toNumber(quotation.totals?.grandTotal);
        const advancePayment = toNumber(
            quotation.totals?.advancePayment || quotation.advancePayment
        );

        const booking = await Booking.create({
            inquiry: inquiryId,

            customer: {
                fullName: safeText(req.body.fullName || quotation.clientName),
                email,
                whatsappNumber,
                country: safeText(
                    req.body.country || quotation.country || quotation.inquiry?.country
                ),
            },

            selectedPackage: req.body.selectedPackage || null,

            travelStartDate: quotation.travelStartDate,
            travelEndDate: quotation.travelEndDate,

            numberOfTravelers: Math.max(
                toNumber(req.body.numberOfTravelers || quotation.travelers),
                1
            ),

            vehicleType: normalizeVehicleType(quotation.vehicleType),

            totalPrice,
            currency: quotation.currency || "USD",
            advancePayment,

            paymentStatus:
                req.body.paymentStatus || resolvePaymentStatus(advancePayment, totalPrice),

            bookingStatus: req.body.bookingStatus || "Confirmed",

            specialRequests: safeText(req.body.specialRequests || quotation.notes),

            adminNotes: safeText(
                req.body.adminNotes ||
                `Booking created from quotation ${quotation.quotationNo}.`
            ),
        });

        quotation.booking = booking._id;
        quotation.status = "Accepted";
        quotation.acceptedDate = quotation.acceptedDate || new Date();

        await quotation.save();

        if (inquiryId) {
            await Inquiry.findByIdAndUpdate(inquiryId, {
                status: "Converted",
            });
        }

        res.status(201).json({
            message: "Quotation converted to booking successfully",
            quotation,
            booking,
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to convert quotation to booking",
            error: error.message,
        });
    }
};

module.exports = {
    convertQuotationToBooking,
};