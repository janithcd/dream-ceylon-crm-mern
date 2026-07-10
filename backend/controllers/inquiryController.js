const Inquiry = require("../models/Inquiry");

// @desc    Create new inquiry
// @route   POST /api/inquiries
// @access  Public
const createInquiry = async (req, res) => {
    try {
        const {
            fullName,
            email,
            whatsappNumber,
            country,
            travelDate,
            numberOfTravelers,
            interestedPackage,
            message,
            source,
        } = req.body;

        if (!fullName || !email || !whatsappNumber || !country || !message) {
            return res.status(400).json({
                message:
                    "Please provide full name, email, WhatsApp number, country, and message",
            });
        }

        const inquiry = await Inquiry.create({
            fullName,
            email,
            whatsappNumber,
            country,
            travelDate,
            numberOfTravelers,
            interestedPackage,
            message,
            source,
        });

        res.status(201).json({
            message: "Inquiry submitted successfully",
            inquiry,
        });
    } catch (error) {
        res.status(500).json({
            message: "Server error",
            error: error.message,
        });
    }
};

// @desc    Get all inquiries with search, filter, and pagination
// @route   GET /api/inquiries
// @access  Private
const getInquiries = async (req, res) => {
    try {
        const {
            keyword,
            status,
            priority,
            source,
            page = 1,
            limit = 10,
        } = req.query;

        const query = {};

        if (keyword) {
            query.$or = [
                { fullName: { $regex: keyword, $options: "i" } },
                { email: { $regex: keyword, $options: "i" } },
                { whatsappNumber: { $regex: keyword, $options: "i" } },
                { country: { $regex: keyword, $options: "i" } },
                { message: { $regex: keyword, $options: "i" } },
            ];
        }

        if (status) {
            query.status = status;
        }

        if (priority) {
            query.priority = priority;
        }

        if (source) {
            query.source = source;
        }

        const pageNumber = Number(page);
        const pageSize = Number(limit);

        const totalInquiries = await Inquiry.countDocuments(query);

        const inquiries = await Inquiry.find(query)
            .populate("interestedPackage", "title durationDays category priceFrom currency")
            .sort({ createdAt: -1 })
            .skip((pageNumber - 1) * pageSize)
            .limit(pageSize);

        res.status(200).json({
            inquiries,
            currentPage: pageNumber,
            totalPages: Math.ceil(totalInquiries / pageSize),
            totalInquiries,
        });
    } catch (error) {
        res.status(500).json({
            message: "Server error",
            error: error.message,
        });
    }
};

// @desc    Get single inquiry
// @route   GET /api/inquiries/:id
// @access  Private
const getInquiryById = async (req, res) => {
    try {
        const inquiry = await Inquiry.findById(req.params.id).populate(
            "interestedPackage",
            "title durationDays category priceFrom currency"
        );

        if (!inquiry) {
            return res.status(404).json({
                message: "Inquiry not found",
            });
        }

        res.status(200).json(inquiry);
    } catch (error) {
        res.status(500).json({
            message: "Server error",
            error: error.message,
        });
    }
};


const updateInquiry = async (req, res) => {
    try {
        const inquiry = await Inquiry.findById(req.params.id);

        if (!inquiry) {
            return res.status(404).json({
                message: "Inquiry not found",
            });
        }

        const updatedInquiry = await Inquiry.findByIdAndUpdate(
            req.params.id,
            req.body,
            {
                new: true,
                runValidators: true,
            }
        ).populate("interestedPackage", "title durationDays category priceFrom currency");

        res.status(200).json(updatedInquiry);
    } catch (error) {
        res.status(500).json({
            message: "Server error",
            error: error.message,
        });
    }
};


const deleteInquiry = async (req, res) => {
    try {
        const inquiry = await Inquiry.findById(req.params.id);

        if (!inquiry) {
            return res.status(404).json({
                message: "Inquiry not found",
            });
        }

        await Inquiry.findByIdAndDelete(req.params.id);

        res.status(200).json({
            message: "Inquiry deleted successfully",
        });
    } catch (error) {
        res.status(500).json({
            message: "Server error",
            error: error.message,
        });
    }
};

module.exports = {
    createInquiry,
    getInquiries,
    getInquiryById,
    updateInquiry,
    deleteInquiry,
};