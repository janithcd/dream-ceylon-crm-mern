const FollowUp = require("../models/FollowUp");
const Inquiry = require("../models/Inquiry");
const Quotation = require("../models/Quotation");
const Booking = require("../models/Booking");

const safeText = (value) => {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
};

const getStartOfDay = (date = new Date()) => {
    const newDate = new Date(date);
    newDate.setHours(0, 0, 0, 0);
    return newDate;
};

const getEndOfDay = (date = new Date()) => {
    const newDate = new Date(date);
    newDate.setHours(23, 59, 59, 999);
    return newDate;
};

const buildDateFilter = (filterType) => {
    const todayStart = getStartOfDay();
    const todayEnd = getEndOfDay();

    if (filterType === "today") {
        return {
            followUpDate: {
                $gte: todayStart,
                $lte: todayEnd,
            },
            status: "Pending",
        };
    }

    if (filterType === "overdue") {
        return {
            followUpDate: {
                $lt: todayStart,
            },
            status: "Pending",
        };
    }

    if (filterType === "upcoming") {
        return {
            followUpDate: {
                $gt: todayEnd,
            },
            status: "Pending",
        };
    }

    return {};
};

const autoFillCustomerDetails = async (data) => {
    let customerName = safeText(data.customerName);
    let customerContact = safeText(data.customerContact);

    if (customerName && customerContact) {
        return {
            customerName,
            customerContact,
        };
    }

    if (data.inquiry) {
        const inquiry = await Inquiry.findById(data.inquiry);

        if (inquiry) {
            customerName = customerName || inquiry.fullName || "";
            customerContact =
                customerContact || inquiry.whatsappNumber || inquiry.email || "";
        }
    }

    if (data.quotation) {
        const quotation = await Quotation.findById(data.quotation).populate(
            "inquiry",
            "fullName email whatsappNumber country"
        );

        if (quotation) {
            customerName =
                customerName ||
                quotation.clientName ||
                quotation.inquiry?.fullName ||
                "";

            customerContact =
                customerContact ||
                quotation.inquiry?.whatsappNumber ||
                quotation.inquiry?.email ||
                "";
        }
    }

    if (data.booking) {
        const booking = await Booking.findById(data.booking);

        if (booking) {
            customerName = customerName || booking.customer?.fullName || "";
            customerContact =
                customerContact ||
                booking.customer?.whatsappNumber ||
                booking.customer?.email ||
                "";
        }
    }

    return {
        customerName,
        customerContact,
    };
};


const createFollowUp = async (req, res) => {
    try {
        const {
            title,
            type,
            inquiry,
            quotation,
            booking,
            customerName,
            customerContact,
            followUpDate,
            priority,
            status,
            notes,
        } = req.body;

        if (!title) {
            return res.status(400).json({
                message: "Follow-up title is required",
            });
        }

        if (!followUpDate) {
            return res.status(400).json({
                message: "Follow-up date is required",
            });
        }

        const customerDetails = await autoFillCustomerDetails({
            inquiry,
            quotation,
            booking,
            customerName,
            customerContact,
        });

        const followUp = await FollowUp.create({
            title: safeText(title),
            type: type || "General",
            inquiry: inquiry || null,
            quotation: quotation || null,
            booking: booking || null,
            customerName: customerDetails.customerName,
            customerContact: customerDetails.customerContact,
            followUpDate,
            priority: priority || "Medium",
            status: status || "Pending",
            notes: safeText(notes),
            completedAt: status === "Completed" ? new Date() : null,
        });

        const populatedFollowUp = await FollowUp.findById(followUp._id)
            .populate("inquiry", "fullName email whatsappNumber country status")
            .populate("quotation", "quotationNo clientName tourTitle status totals")
            .populate(
                "booking",
                "bookingCode customer travelStartDate travelEndDate paymentStatus bookingStatus"
            );

        res.status(201).json({
            message: "Follow-up created successfully",
            followUp: populatedFollowUp,
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to create follow-up",
            error: error.message,
        });
    }
};


const getFollowUps = async (req, res) => {
    try {
        const {
            keyword,
            status,
            priority,
            type,
            dateFilter,
            page = 1,
            limit = 10,
        } = req.query;

        const query = {
            ...buildDateFilter(dateFilter),
        };

        if (status) {
            query.status = status;
        }

        if (priority) {
            query.priority = priority;
        }

        if (type) {
            query.type = type;
        }

        if (keyword) {
            query.$or = [
                {
                    title: {
                        $regex: keyword,
                        $options: "i",
                    },
                },
                {
                    customerName: {
                        $regex: keyword,
                        $options: "i",
                    },
                },
                {
                    customerContact: {
                        $regex: keyword,
                        $options: "i",
                    },
                },
                {
                    notes: {
                        $regex: keyword,
                        $options: "i",
                    },
                },
            ];
        }

        const currentPage = Number(page);
        const pageLimit = Number(limit);
        const skip = (currentPage - 1) * pageLimit;

        const totalFollowUps = await FollowUp.countDocuments(query);

        const followUps = await FollowUp.find(query)
            .populate("inquiry", "fullName email whatsappNumber country status")
            .populate("quotation", "quotationNo clientName tourTitle status totals")
            .populate(
                "booking",
                "bookingCode customer travelStartDate travelEndDate paymentStatus bookingStatus"
            )
            .sort({
                status: 1,
                followUpDate: 1,
                priority: -1,
                createdAt: -1,
            })
            .skip(skip)
            .limit(pageLimit);

        res.status(200).json({
            followUps,
            currentPage,
            totalPages: Math.ceil(totalFollowUps / pageLimit),
            totalFollowUps,
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to fetch follow-ups",
            error: error.message,
        });
    }
};


const getFollowUpSummary = async (req, res) => {
    try {
        const todayStart = getStartOfDay();
        const todayEnd = getEndOfDay();

        const totalPending = await FollowUp.countDocuments({
            status: "Pending",
        });

        const today = await FollowUp.countDocuments({
            status: "Pending",
            followUpDate: {
                $gte: todayStart,
                $lte: todayEnd,
            },
        });

        const overdue = await FollowUp.countDocuments({
            status: "Pending",
            followUpDate: {
                $lt: todayStart,
            },
        });

        const upcoming = await FollowUp.countDocuments({
            status: "Pending",
            followUpDate: {
                $gt: todayEnd,
            },
        });

        const completed = await FollowUp.countDocuments({
            status: "Completed",
        });

        const urgent = await FollowUp.countDocuments({
            status: "Pending",
            priority: "Urgent",
        });

        res.status(200).json({
            totalPending,
            today,
            overdue,
            upcoming,
            completed,
            urgent,
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to fetch follow-up summary",
            error: error.message,
        });
    }
};


const getFollowUpById = async (req, res) => {
    try {
        const followUp = await FollowUp.findById(req.params.id)
            .populate("inquiry", "fullName email whatsappNumber country status")
            .populate("quotation", "quotationNo clientName tourTitle status totals")
            .populate(
                "booking",
                "bookingCode customer travelStartDate travelEndDate paymentStatus bookingStatus"
            );

        if (!followUp) {
            return res.status(404).json({
                message: "Follow-up not found",
            });
        }

        res.status(200).json(followUp);
    } catch (error) {
        res.status(500).json({
            message: "Failed to fetch follow-up",
            error: error.message,
        });
    }
};


const updateFollowUp = async (req, res) => {
    try {
        const followUp = await FollowUp.findById(req.params.id);

        if (!followUp) {
            return res.status(404).json({
                message: "Follow-up not found",
            });
        }

        const customerDetails = await autoFillCustomerDetails({
            inquiry: req.body.inquiry ?? followUp.inquiry,
            quotation: req.body.quotation ?? followUp.quotation,
            booking: req.body.booking ?? followUp.booking,
            customerName: req.body.customerName ?? followUp.customerName,
            customerContact: req.body.customerContact ?? followUp.customerContact,
        });

        followUp.title = safeText(req.body.title ?? followUp.title);
        followUp.type = req.body.type || followUp.type;
        followUp.inquiry = req.body.inquiry ?? followUp.inquiry;
        followUp.quotation = req.body.quotation ?? followUp.quotation;
        followUp.booking = req.body.booking ?? followUp.booking;
        followUp.customerName = customerDetails.customerName;
        followUp.customerContact = customerDetails.customerContact;
        followUp.followUpDate = req.body.followUpDate || followUp.followUpDate;
        followUp.priority = req.body.priority || followUp.priority;
        followUp.status = req.body.status || followUp.status;
        followUp.notes = safeText(req.body.notes ?? followUp.notes);

        if (followUp.status === "Completed" && !followUp.completedAt) {
            followUp.completedAt = new Date();
        }

        if (followUp.status !== "Completed") {
            followUp.completedAt = null;
        }

        await followUp.save();

        const populatedFollowUp = await FollowUp.findById(followUp._id)
            .populate("inquiry", "fullName email whatsappNumber country status")
            .populate("quotation", "quotationNo clientName tourTitle status totals")
            .populate(
                "booking",
                "bookingCode customer travelStartDate travelEndDate paymentStatus bookingStatus"
            );

        res.status(200).json({
            message: "Follow-up updated successfully",
            followUp: populatedFollowUp,
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to update follow-up",
            error: error.message,
        });
    }
};


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

        if (req.body.notes) {
            followUp.notes = safeText(req.body.notes);
        }

        await followUp.save();

        res.status(200).json({
            message: "Follow-up marked as completed",
            followUp,
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to complete follow-up",
            error: error.message,
        });
    }
};


const deleteFollowUp = async (req, res) => {
    try {
        const followUp = await FollowUp.findById(req.params.id);

        if (!followUp) {
            return res.status(404).json({
                message: "Follow-up not found",
            });
        }

        await followUp.deleteOne();

        res.status(200).json({
            message: "Follow-up deleted successfully",
        });
    } catch (error) {
        res.status(500).json({
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