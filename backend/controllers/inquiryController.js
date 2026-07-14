const mongoose = require("mongoose");
const Inquiry = require("../models/Inquiry");
const { createActivityLog } = require("../utils/createActivityLog");

const safeText = (value) => {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
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
    if (!value || !mongoose.Types.ObjectId.isValid(value)) {
        return null;
    }

    return value;
};

const populateInquiry = (query) => {
    return query.populate(
        "interestedPackage",
        "title durationDays category priceFrom currency status"
    );
};

const buildInquiryQuery = (queryParams) => {
    const { keyword, status, priority, source } = queryParams;
    const query = {};

    if (status) {
        query.status = status;
    }

    if (priority) {
        query.priority = priority;
    }

    if (source) {
        query.source = source;
    }

    if (keyword) {
        query.$or = [
            { fullName: buildRegex(keyword) },
            { email: buildRegex(keyword) },
            { whatsappNumber: buildRegex(keyword) },
            { country: buildRegex(keyword) },
            { message: buildRegex(keyword) },
            { adminNotes: buildRegex(keyword) },
        ];
    }

    return query;
};

const buildInquiryPayload = (body, existingInquiry = null) => {
    const payload = {};

    const assignText = (field) => {
        if (body[field] !== undefined) {
            payload[field] = safeText(body[field]);
        } else if (existingInquiry) {
            payload[field] = existingInquiry[field];
        }
    };

    assignText("fullName");
    assignText("email");
    assignText("whatsappNumber");
    assignText("country");
    assignText("message");
    assignText("status");
    assignText("priority");
    assignText("source");
    assignText("adminNotes");

    if (body.travelDate !== undefined) {
        payload.travelDate = body.travelDate || null;
    } else if (existingInquiry) {
        payload.travelDate = existingInquiry.travelDate;
    }

    if (body.numberOfTravelers !== undefined) {
        const travelers = Number(body.numberOfTravelers);
        payload.numberOfTravelers = Number.isFinite(travelers)
            ? Math.max(travelers, 0)
            : 0;
    } else if (existingInquiry) {
        payload.numberOfTravelers = existingInquiry.numberOfTravelers;
    }

    if (body.interestedPackage !== undefined) {
        payload.interestedPackage = normalizeObjectId(body.interestedPackage);
    } else if (existingInquiry) {
        payload.interestedPackage = existingInquiry.interestedPackage || null;
    }

    if (!payload.status) {
        payload.status = "New";
    }

    if (!payload.priority) {
        payload.priority = "Medium";
    }

    if (!payload.source) {
        payload.source = "Website";
    }

    return payload;
};

// @desc    Create a new inquiry
// @route   POST /api/inquiries
// @access  Public
const createInquiry = async (req, res) => {
    try {
        const payload = buildInquiryPayload(req.body);

        if (!payload.fullName) {
            return res.status(400).json({
                message: "Customer name is required",
            });
        }

        const inquiry = await Inquiry.create(payload);

        await createActivityLog({
            req,
            action: "CREATE",
            module: "Inquiry",
            description: `Inquiry was created for ${inquiry.fullName}`,
            relatedRecordId: inquiry._id,
            relatedModel: "Inquiry",
            referenceNo: inquiry._id.toString(),
            customerName: inquiry.fullName,
            metadata: {
                email: inquiry.email,
                whatsappNumber: inquiry.whatsappNumber,
                country: inquiry.country,
                status: inquiry.status,
                priority: inquiry.priority,
                source: inquiry.source,
                travelDate: inquiry.travelDate,
                numberOfTravelers: inquiry.numberOfTravelers,
            },
        });

        const populatedInquiry = await populateInquiry(
            Inquiry.findById(inquiry._id)
        );

        return res.status(201).json({
            message: "Inquiry created successfully",
            inquiry: populatedInquiry,
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to create inquiry",
            error: error.message,
        });
    }
};

// @desc    Get inquiries
// @route   GET /api/inquiries
// @access  Private
const getInquiries = async (req, res) => {
    try {
        const page = parsePositiveInteger(req.query.page, 1);
        const limit = Math.min(parsePositiveInteger(req.query.limit, 10), 10000);
        const skip = (page - 1) * limit;
        const query = buildInquiryQuery(req.query);

        const [inquiries, totalInquiries] = await Promise.all([
            populateInquiry(
                Inquiry.find(query)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
            ),
            Inquiry.countDocuments(query),
        ]);

        return res.status(200).json({
            inquiries,
            currentPage: page,
            totalPages: Math.ceil(totalInquiries / limit) || 1,
            totalInquiries,
            limit,
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to load inquiries",
            error: error.message,
        });
    }
};

// @desc    Get one inquiry
// @route   GET /api/inquiries/:id
// @access  Private
const getInquiryById = async (req, res) => {
    try {
        const inquiry = await populateInquiry(Inquiry.findById(req.params.id));

        if (!inquiry) {
            return res.status(404).json({
                message: "Inquiry not found",
            });
        }

        return res.status(200).json(inquiry);
    } catch (error) {
        return res.status(500).json({
            message: "Failed to load inquiry",
            error: error.message,
        });
    }
};

// @desc    Update inquiry
// @route   PUT /api/inquiries/:id
// @access  Private
const updateInquiry = async (req, res) => {
    try {
        const inquiry = await Inquiry.findById(req.params.id);

        if (!inquiry) {
            return res.status(404).json({
                message: "Inquiry not found",
            });
        }

        const payload = buildInquiryPayload(req.body, inquiry);

        if (!payload.fullName) {
            return res.status(400).json({
                message: "Customer name is required",
            });
        }

        Object.assign(inquiry, payload);
        await inquiry.save();

        await createActivityLog({
            req,
            action: "UPDATE",
            module: "Inquiry",
            description: `Inquiry for ${inquiry.fullName} was updated`,
            relatedRecordId: inquiry._id,
            relatedModel: "Inquiry",
            referenceNo: inquiry._id.toString(),
            customerName: inquiry.fullName,
            metadata: {
                updatedFields: Object.keys(req.body || {}),
                status: inquiry.status,
                priority: inquiry.priority,
                source: inquiry.source,
                travelDate: inquiry.travelDate,
                numberOfTravelers: inquiry.numberOfTravelers,
            },
        });

        const populatedInquiry = await populateInquiry(
            Inquiry.findById(inquiry._id)
        );

        return res.status(200).json({
            message: "Inquiry updated successfully",
            inquiry: populatedInquiry,
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to update inquiry",
            error: error.message,
        });
    }
};

// @desc    Delete inquiry
// @route   DELETE /api/inquiries/:id
// @access  Private
const deleteInquiry = async (req, res) => {
    try {
        const inquiry = await Inquiry.findById(req.params.id);

        if (!inquiry) {
            return res.status(404).json({
                message: "Inquiry not found",
            });
        }

        const deletedDetails = {
            id: inquiry._id,
            fullName: inquiry.fullName,
            email: inquiry.email,
            whatsappNumber: inquiry.whatsappNumber,
            country: inquiry.country,
            status: inquiry.status,
            priority: inquiry.priority,
            source: inquiry.source,
        };

        await inquiry.deleteOne();

        await createActivityLog({
            req,
            action: "DELETE",
            module: "Inquiry",
            description: `Inquiry for ${deletedDetails.fullName} was deleted`,
            relatedRecordId: deletedDetails.id,
            relatedModel: "Inquiry",
            referenceNo: deletedDetails.id.toString(),
            customerName: deletedDetails.fullName,
            metadata: {
                email: deletedDetails.email,
                whatsappNumber: deletedDetails.whatsappNumber,
                country: deletedDetails.country,
                status: deletedDetails.status,
                priority: deletedDetails.priority,
                source: deletedDetails.source,
            },
        });

        return res.status(200).json({
            message: "Inquiry deleted successfully",
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to delete inquiry",
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
