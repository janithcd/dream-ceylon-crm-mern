const Booking = require("../models/Booking");
const Inquiry = require("../models/Inquiry");


const createBooking = async (req, res) => {
    try {
        const {
            inquiry,
            customer,
            selectedPackage,
            travelStartDate,
            travelEndDate,
            numberOfTravelers,
            vehicleType,
            totalPrice,
            currency,
            advancePayment,
            paymentStatus,
            bookingStatus,
            specialRequests,
            adminNotes,
        } = req.body;

        if (
            !customer ||
            !customer.fullName ||
            !customer.email ||
            !customer.whatsappNumber ||
            !customer.country ||
            !travelStartDate ||
            !travelEndDate ||
            !numberOfTravelers ||
            totalPrice === undefined
        ) {
            return res.status(400).json({
                message:
                    "Please provide customer details, travel dates, number of travelers, and total price",
            });
        }

        const booking = await Booking.create({
            inquiry,
            customer,
            selectedPackage,
            travelStartDate,
            travelEndDate,
            numberOfTravelers,
            vehicleType,
            totalPrice,
            currency,
            advancePayment,
            paymentStatus,
            bookingStatus,
            specialRequests,
            adminNotes,
        });


        if (inquiry) {
            await Inquiry.findByIdAndUpdate(inquiry, {
                status: "Converted",
            });
        }

        const populatedBooking = await Booking.findById(booking._id)
            .populate("inquiry", "fullName email whatsappNumber country status")
            .populate("selectedPackage", "title durationDays category priceFrom currency");

        res.status(201).json(populatedBooking);
    } catch (error) {
        res.status(500).json({
            message: "Server error",
            error: error.message,
        });
    }
};


const getBookings = async (req, res) => {
    try {
        const {
            keyword,
            bookingStatus,
            paymentStatus,
            vehicleType,
            page = 1,
            limit = 10,
        } = req.query;

        const query = {};

        if (keyword) {
            query.$or = [
                { bookingCode: { $regex: keyword, $options: "i" } },
                { "customer.fullName": { $regex: keyword, $options: "i" } },
                { "customer.email": { $regex: keyword, $options: "i" } },
                { "customer.whatsappNumber": { $regex: keyword, $options: "i" } },
                { "customer.country": { $regex: keyword, $options: "i" } },
            ];
        }

        if (bookingStatus) {
            query.bookingStatus = bookingStatus;
        }

        if (paymentStatus) {
            query.paymentStatus = paymentStatus;
        }

        if (vehicleType) {
            query.vehicleType = vehicleType;
        }

        const pageNumber = Number(page);
        const pageSize = Number(limit);

        const totalBookings = await Booking.countDocuments(query);

        const bookings = await Booking.find(query)
            .populate("inquiry", "fullName email whatsappNumber country status")
            .populate("selectedPackage", "title durationDays category priceFrom currency")
            .sort({ createdAt: -1 })
            .skip((pageNumber - 1) * pageSize)
            .limit(pageSize);

        res.status(200).json({
            bookings,
            currentPage: pageNumber,
            totalPages: Math.ceil(totalBookings / pageSize),
            totalBookings,
        });
    } catch (error) {
        res.status(500).json({
            message: "Server error",
            error: error.message,
        });
    }
};


const getBookingById = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id)
            .populate("inquiry", "fullName email whatsappNumber country status message")
            .populate("selectedPackage", "title durationDays category priceFrom currency");

        if (!booking) {
            return res.status(404).json({
                message: "Booking not found",
            });
        }

        res.status(200).json(booking);
    } catch (error) {
        res.status(500).json({
            message: "Server error",
            error: error.message,
        });
    }
};


const updateBooking = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);

        if (!booking) {
            return res.status(404).json({
                message: "Booking not found",
            });
        }

        const updatedBooking = await Booking.findByIdAndUpdate(
            req.params.id,
            req.body,
            {
                new: true,
                runValidators: true,
            }
        )
            .populate("inquiry", "fullName email whatsappNumber country status")
            .populate("selectedPackage", "title durationDays category priceFrom currency");

        res.status(200).json(updatedBooking);
    } catch (error) {
        res.status(500).json({
            message: "Server error",
            error: error.message,
        });
    }
};


const deleteBooking = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);

        if (!booking) {
            return res.status(404).json({
                message: "Booking not found",
            });
        }

        await Booking.findByIdAndDelete(req.params.id);

        res.status(200).json({
            message: "Booking deleted successfully",
        });
    } catch (error) {
        res.status(500).json({
            message: "Server error",
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