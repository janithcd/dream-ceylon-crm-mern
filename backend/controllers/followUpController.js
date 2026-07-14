const mongoose = require("mongoose");
const FollowUp = require("../models/FollowUp");
const Inquiry = require("../models/Inquiry");
const Quotation = require("../models/Quotation");
const Booking = require("../models/Booking");
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

const buildRegex = (value) => {
    return {
        $regex: escapeRegex(value),
        $options: "i",
    };
};

const isValidObjectId = (value) => {
    return Boolean(value && mongoose.Types.ObjectId.isValid(value));
};

const parsePositiveInteger = (value, fallback) => {
    const number = Number.parseInt(value, 10);

    if (!Number.isFinite(number) || number < 1) {
        return fallback;
    }

    return number;
};

const getStartOfToday = () => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
};

const getEndOfToday = () => {
    const date = new Date();
    date.setHours(23, 59, 59, 999);
    return date;
};

const getLinkedCustomerData = async ({ inquiry, quotation, booking }) => {
    if (isValidObjectId(booking)) {
        const bookingRecord = await Booking.findById(booking).select(
            "bookingCode customer"
        );

        if (bookingRecord) {
            return {
                customerName: safeText(bookingRecord.customer?.fullName),
                customerContact:
                    safeText(bookingRecord.customer?.whatsappNumber) ||
                    safeText(bookingRecord.customer?.email) ||
                    safeText(bookingRecord.customer?.country),
            };
        }
    }

    if (isValidObjectId(quotation)) {
        const quotationRecord = await Quotation.findById(quotation).select(
            "clientName country quotationNo"
        );

        if (quotationRecord) {
            return {
                customerName: safeText(quotationRecord.clientName),
                customerContact: safeText(quotationRecord.country),
            };
        }
    }

    if (isValidObjectId(inquiry)) {
        const inquiryRecord = await Inquiry.findById(inquiry).select(
            "fullName email whatsappNumber country"
        );

        if (inquiryRecord) {
            return {
                customerName: safeText(inquiryRecord.fullName),
                customerContact:
                    safeText(inquiryRecord.whatsappNumber) ||
                    safeText(inquiryRecord.email) ||
                    safeText(inquiryRecord.country),
            };
        }
    }

    return {
        customerName: "",
        customerContact: "",
    };
};

const populateFollowUp = (query) => {
    return query
        .populate(
            "inquiry",
            "fullName email whatsappNumber country status travelDate"
        )
        .populate(
            "quotation",
            "quotationNo clientName country tourTitle status currency totals"
        )
        .populate(
            "booking",
            "bookingCode customer bookingStatus paymentStatus travelStartDate travelEndDate"
        );
};

const buildFollowUpQuery = (queryParams) => {
    const {
        keyword,
        status,
        priority,
        type,
        dateFilter,
        inquiry,
        quotation,
        booking,
    } = queryParams;

    const query = {};

    if (status) {
        query.status = status;
    }

    if (priority) {
        query.priority = priority;
    }

    if (type) {
        query.type = type;
    }

    if (isValidObjectId(inquiry)) {
        query.inquiry = inquiry;
    }

    if (isValidObjectId(quotation)) {
        query.quotation = quotation;
    }

    if (isValidObjectId(booking)) {
        query.booking = booking;
    }

    if (keyword) {
        query.$or = [
            {
                title: buildRegex(keyword),
            },
            {
                notes: buildRegex(keyword),
            },
            {
                customerName: buildRegex(keyword),
            },
            {
                customerContact: buildRegex(keyword),
            },
        ];
    }

    const todayStart = getStartOfToday();
    const todayEnd = getEndOfToday();

    if (dateFilter === "today") {
        query.followUpDate = {
            $gte: todayStart,
            $lte: todayEnd,
        };
    }

    if (dateFilter === "overdue") {
        query.followUpDate = {
            $lt: todayStart,
        };

        if (!status) {
            query.status = "Pending";
        }
    }

    if (dateFilter === "upcoming") {
        query.followUpDate = {
            $gt: todayEnd,
        };

        if (!status) {
            query.status = "Pending";
        }
    }

    return query;
};

const buildFollowUpPayload = async (body, existingFollowUp = null) => {
    const inquiry = body.inquiry !== undefined ? body.inquiry || null : existingFollowUp?.inquiry || null;
    const quotation =
        body.quotation !== undefined
            ? body.quotation || null
            : existingFollowUp?.quotation || null;
    const booking = body.booking !== undefined ? body.booking || null : existingFollowUp?.booking || null;

    const linkedCustomer = await getLinkedCustomerData({
        inquiry,
        quotation,
        booking,
    });

    return {
        title:
            body.title !== undefined
                ? safeText(body.title)
                : safeText(existingFollowUp?.title),
        type:
            body.type !== undefined
                ? safeText(body.type)
                : safeText(existingFollowUp?.type) || "General",
        inquiry,
        quotation,
        booking,
        customerName:
            body.customerName !== undefined
                ? safeText(body.customerName)
                : linkedCustomer.customerName || safeText(existingFollowUp?.customerName),
        customerContact:
            body.customerContact !== undefined
                ? safeText(body.customerContact)
                : linkedCustomer.customerContact ||
                safeText(existingFollowUp?.customerContact),
        followUpDate:
            body.followUpDate !== undefined
                ? body.followUpDate
                : existingFollowUp?.followUpDate,
        priority:
            body.priority !== undefined
                ? safeText(body.priority)
                : safeText(existingFollowUp?.priority) || "Medium",
        status:
            body.status !== undefined
                ? safeText(body.status)
                : safeText(existingFollowUp?.status) || "Pending",
        notes:
            body.notes !== undefined
                ? safeText(body.notes)
                : safeText(existingFollowUp?.notes),
    };
};

// @desc    Create a follow-up
// @route   POST /api/follow-ups
// @access  Private
const createFollowUp = async (req, res) => {
    try {
        const followUpData = await buildFollowUpPayload(req.body);

        if (!followUpData.title) {
            return res.status(400).json({
                message: "Follow-up title is required",
            });
        }

        if (!followUpData.followUpDate) {
            return res.status(400).json({
                message: "Follow-up date is required",
            });
        }

        const followUp = await FollowUp.create(followUpData);

        await createActivityLog({
            req,
            action: "CREATE",
            module: "Follow-Up",
            description: `Follow-up "${followUp.title}" was created${
                followUp.customerName ? ` for ${followUp.customerName}` : ""
            }`,
            relatedRecordId: followUp._id,
            relatedModel: "FollowUp",
            referenceNo: followUp._id.toString(),
            customerName: followUp.customerName,
            metadata: {
                type: followUp.type,
                priority: followUp.priority,
                status: followUp.status,
                followUpDate: followUp.followUpDate,
            },
        });

        const populatedFollowUp = await populateFollowUp(
            FollowUp.findById(followUp._id)
        );

        return res.status(201).json({
            message: "Follow-up created successfully",
            followUp: populatedFollowUp,
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to create follow-up",
            error: error.message,
        });
    }
};

// @desc    Get follow-ups
// @route   GET /api/follow-ups
// @access  Private
const getFollowUps = async (req, res) => {
    try {
        const page = parsePositiveInteger(req.query.page, 1);
        const limit = Math.min(parsePositiveInteger(req.query.limit, 10), 100);
        const skip = (page - 1) * limit;
        const query = buildFollowUpQuery(req.query);

        const [followUps, totalFollowUps] = await Promise.all([
            populateFollowUp(
                FollowUp.find(query)
                    .sort({
                        followUpDate: 1,
                        createdAt: -1,
                    })
                    .skip(skip)
                    .limit(limit)
            ),
            FollowUp.countDocuments(query),
        ]);

        return res.status(200).json({
            followUps,
            currentPage: page,
            totalPages: Math.ceil(totalFollowUps / limit) || 1,
            totalFollowUps,
            limit,
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to load follow-ups",
            error: error.message,
        });
    }
};

// @desc    Get follow-up summary
// @route   GET /api/follow-ups/summary
// @access  Private
const getFollowUpSummary = async (req, res) => {
    try {
        const todayStart = getStartOfToday();
        const todayEnd = getEndOfToday();

        const [
            totalFollowUps,
            pendingFollowUps,
            completedFollowUps,
            cancelledFollowUps,
            todayFollowUps,
            overdueFollowUps,
            upcomingFollowUps,
            urgentFollowUps,
        ] = await Promise.all([
            FollowUp.countDocuments(),
            FollowUp.countDocuments({ status: "Pending" }),
            FollowUp.countDocuments({ status: "Completed" }),
            FollowUp.countDocuments({ status: "Cancelled" }),
            FollowUp.countDocuments({
                status: "Pending",
                followUpDate: {
                    $gte: todayStart,
                    $lte: todayEnd,
                },
            }),
            FollowUp.countDocuments({
                status: "Pending",
                followUpDate: {
                    $lt: todayStart,
                },
            }),
            FollowUp.countDocuments({
                status: "Pending",
                followUpDate: {
                    $gt: todayEnd,
                },
            }),
            FollowUp.countDocuments({
                status: "Pending",
                priority: "Urgent",
            }),
        ]);

        return res.status(200).json({
            totalFollowUps,
            pendingFollowUps,
            completedFollowUps,
            cancelledFollowUps,
            todayFollowUps,
            overdueFollowUps,
            upcomingFollowUps,
            urgentFollowUps,

            // Compatibility aliases for existing frontend components
            total: totalFollowUps,
            pending: pendingFollowUps,
            completed: completedFollowUps,
            cancelled: cancelledFollowUps,
            today: todayFollowUps,
            overdue: overdueFollowUps,
            upcoming: upcomingFollowUps,
            urgent: urgentFollowUps,
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to load follow-up summary",
            error: error.message,
        });
    }
};

// @desc    Get one follow-up
// @route   GET /api/follow-ups/:id
// @access  Private
const getFollowUpById = async (req, res) => {
    try {
        const followUp = await populateFollowUp(
            FollowUp.findById(req.params.id)
        );

        if (!followUp) {
            return res.status(404).json({
                message: "Follow-up not found",
            });
        }

        return res.status(200).json(followUp);
    } catch (error) {
        return res.status(500).json({
            message: "Failed to load follow-up",
            error: error.message,
        });
    }
};

// @desc    Update follow-up
// @route   PUT /api/follow-ups/:id
// @access  Private
const updateFollowUp = async (req, res) => {
    try {
        const followUp = await FollowUp.findById(req.params.id);

        if (!followUp) {
            return res.status(404).json({
                message: "Follow-up not found",
            });
        }

        const updatedData = await buildFollowUpPayload(req.body, followUp);

        followUp.title = updatedData.title;
        followUp.type = updatedData.type;
        followUp.inquiry = updatedData.inquiry;
        followUp.quotation = updatedData.quotation;
        followUp.booking = updatedData.booking;
        followUp.customerName = updatedData.customerName;
        followUp.customerContact = updatedData.customerContact;
        followUp.followUpDate = updatedData.followUpDate;
        followUp.priority = updatedData.priority;
        followUp.status = updatedData.status;
        followUp.notes = updatedData.notes;

        if (followUp.status === "Completed" && !followUp.completedAt) {
            followUp.completedAt = new Date();
        }

        if (followUp.status !== "Completed") {
            followUp.completedAt = null;
        }

        await followUp.save();

        await createActivityLog({
            req,
            action: "UPDATE",
            module: "Follow-Up",
            description: `Follow-up "${followUp.title}" was updated`,
            relatedRecordId: followUp._id,
            relatedModel: "FollowUp",
            referenceNo: followUp._id.toString(),
            customerName: followUp.customerName,
            metadata: {
                updatedFields: Object.keys(req.body || {}),
                type: followUp.type,
                priority: followUp.priority,
                status: followUp.status,
                followUpDate: followUp.followUpDate,
            },
        });

        const populatedFollowUp = await populateFollowUp(
            FollowUp.findById(followUp._id)
        );

        return res.status(200).json({
            message: "Follow-up updated successfully",
            followUp: populatedFollowUp,
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to update follow-up",
            error: error.message,
        });
    }
};

// @desc    Complete follow-up
// @route   PATCH /api/follow-ups/:id/complete
// @access  Private
const completeFollowUp = async (req, res) => {
    try {
        const followUp = await FollowUp.findById(req.params.id);

        if (!followUp) {
            return res.status(404).json({
                message: "Follow-up not found",
            });
        }

        followUp.status = "Completed";
        followUp.completedAt = new Date();

        await followUp.save();

        await createActivityLog({
            req,
            action: "COMPLETE",
            module: "Follow-Up",
            description: `Follow-up "${followUp.title}" was completed${
                followUp.customerName ? ` for ${followUp.customerName}` : ""
            }`,
            relatedRecordId: followUp._id,
            relatedModel: "FollowUp",
            referenceNo: followUp._id.toString(),
            customerName: followUp.customerName,
            metadata: {
                type: followUp.type,
                priority: followUp.priority,
                completedAt: followUp.completedAt,
            },
        });

        const populatedFollowUp = await populateFollowUp(
            FollowUp.findById(followUp._id)
        );

        return res.status(200).json({
            message: "Follow-up completed successfully",
            followUp: populatedFollowUp,
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to complete follow-up",
            error: error.message,
        });
    }
};

// @desc    Delete follow-up
// @route   DELETE /api/follow-ups/:id
// @access  Private
const deleteFollowUp = async (req, res) => {
    try {
        const followUp = await FollowUp.findById(req.params.id);

        if (!followUp) {
            return res.status(404).json({
                message: "Follow-up not found",
            });
        }

        const deletedDetails = {
            id: followUp._id,
            title: followUp.title,
            customerName: followUp.customerName,
            type: followUp.type,
            priority: followUp.priority,
            followUpDate: followUp.followUpDate,
        };

        await followUp.deleteOne();

        await createActivityLog({
            req,
            action: "DELETE",
            module: "Follow-Up",
            description: `Follow-up "${deletedDetails.title}" was deleted${
                deletedDetails.customerName
                    ? ` for ${deletedDetails.customerName}`
                    : ""
            }`,
            relatedRecordId: deletedDetails.id,
            relatedModel: "FollowUp",
            referenceNo: deletedDetails.id.toString(),
            customerName: deletedDetails.customerName,
            metadata: {
                type: deletedDetails.type,
                priority: deletedDetails.priority,
                followUpDate: deletedDetails.followUpDate,
            },
        });

        return res.status(200).json({
            message: "Follow-up deleted successfully",
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to delete follow-up",
            error: error.message,
        });
    }
};

module.exports = {
    createFollowUp,
    getFollowUps,
    getFollowUpSummary,
    getFollowUpById,
    updateFollowUp,
    completeFollowUp,
    deleteFollowUp,
};
