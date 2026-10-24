const Booking = require("../models/Booking");
const mongoose = require("mongoose");
const { createActivityLog } = require("../utils/createActivityLog");
const { parseCalendarDate, parsePaymentDueDate } = require("../utils/paymentDueDate");
const { parseGuestPaymentPlan } = require("../utils/guestPaymentPlan");
const { buildOutstandingBalancesPipeline, buildPaymentAttentionPipeline, DATE_FILTERS, DUE_FILTERS, CONTACT_FILTERS, PAGE_SIZE, OPEN_BOOKING_STATUSES } = require("../utils/outstandingBalances");

const CONTACT_CHANNELS = ["WhatsApp", "Phone", "Email", "Other"];

const getOutstandingBalances = async (req, res) => {
    const dateFilter = req.query.dateFilter || "next30";
    const dueFilter = req.query.dueFilter || "all";
    const contactFilter = req.query.contactFilter || "all";
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    if (!DATE_FILTERS.includes(dateFilter) || !DUE_FILTERS.includes(dueFilter) || !CONTACT_FILTERS.includes(contactFilter) ||
        !Number.isSafeInteger(page) || page < 1 || page > 10000) {
        return res.status(400).json({ message: "Invalid outstanding balance filter or page" });
    }

    try {
        const [result] = await Booking.aggregate(buildOutstandingBalancesPipeline({ dateFilter, dueFilter, contactFilter, page }));
        const summary = result?.summary?.[0] || {};
        const total = result?.total?.[0]?.value || 0;
        return res.status(200).json({
            items: result?.items || [],
            summary: {
                open: summary.open || 0,
                departed: summary.departed || 0,
                next30: summary.next30 || 0,
                later: summary.later || 0,
                overdue: summary.overdue || 0,
                due7: summary.due7 || 0,
                scheduledLater: summary.scheduledLater || 0,
                unscheduled: summary.unscheduled || 0,
                followUpsDue: summary.followUpsDue || 0,
            },
            total, page, totalPages: Math.ceil(total / PAGE_SIZE) || 1,
        });
    } catch (error) {
        console.error("Outstanding balance queue failed:", error.message);
        return res.status(500).json({ message: "Failed to load outstanding balances" });
    }
};

const getPaymentAttention = async (req, res) => {
    try {
        const [result] = await Booking.aggregate(buildPaymentAttentionPipeline());
        const summary = result?.summary?.[0] || {};
        return res.status(200).json({
            summary: {
                total: summary.total || 0,
                followUpsDue: summary.followUpsDue || 0,
                overdue: summary.overdue || 0,
            },
            items: result?.items || [],
        });
    } catch (error) {
        console.error("Payment attention failed:", error.message);
        return res.status(500).json({ message: "Failed to load payment alerts" });
    }
};

const updatePaymentDueDate = async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: "Invalid booking ID" });
    }
    if (!Object.hasOwn(req.body || {}, "paymentDueDate")) {
        return res.status(400).json({ message: "Provide a payment due date or null to clear it" });
    }
    const parsed = parsePaymentDueDate(req.body.paymentDueDate);
    if (parsed.error) return res.status(400).json({ message: parsed.error });

    try {
        const booking = await Booking.findOneAndUpdate(
            {
                _id: req.params.id,
                ...(parsed.value ? { $or: [
                    { hotelAdvanceDueDate: null },
                    { hotelAdvanceDueDate: { $lte: parsed.value } },
                ] } : {}),
            },
            { $set: { paymentDueDate: parsed.value } },
            { new: true, runValidators: true }
        );
        if (!booking) {
            const exists = await Booking.exists({ _id: req.params.id });
            return res.status(exists ? 409 : 404).json({ message: exists
                ? "Final balance cannot be due before the hotel advance." : "Booking not found" });
        }

        await createActivityLog({
            req,
            action: "UPDATE",
            module: "Booking",
            description: `Payment due date ${parsed.value ? "set" : "cleared"} for booking ${booking.bookingCode}`,
            relatedRecordId: booking._id,
            relatedModel: "Booking",
            referenceNo: booking.bookingCode,
            customerName: booking.customer?.fullName,
            metadata: { paymentDueDate: parsed.value },
        });
        return res.status(200).json({ paymentDueDate: booking.paymentDueDate });
    } catch (error) {
        console.error("Payment due date update failed:", error.message);
        return res.status(500).json({ message: "Failed to update payment due date" });
    }
};

const updateHotelAdvance = async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: "Invalid booking ID" });
    }
    if (!Object.hasOwn(req.body || {}, "hotelAdvanceAmount") ||
        !Object.hasOwn(req.body || {}, "hotelAdvanceDueDate")) {
        return res.status(400).json({ message: "Provide the hotel advance amount and due date together" });
    }
    try {
        const current = await Booking.findById(req.params.id)
            .select("totalPrice paymentDueDate");
        if (!current) return res.status(404).json({ message: "Booking not found" });
        const plan = parseGuestPaymentPlan({
            amount: req.body.hotelAdvanceAmount,
            dueDate: req.body.hotelAdvanceDueDate,
            totalPrice: current.totalPrice,
            balanceDueDate: current.paymentDueDate,
        });
        if (plan.error) return res.status(400).json({ message: plan.error });
        const date = plan.value.hotelAdvanceDueDate;
        const booking = await Booking.findOneAndUpdate(
            {
                _id: current._id,
                totalPrice: { $gte: plan.value.hotelAdvanceAmount },
                ...(date ? { $or: [
                    { paymentDueDate: null },
                    { paymentDueDate: { $gte: date } },
                ] } : {}),
            },
            { $set: plan.value },
            { new: true, runValidators: true }
        );
        if (!booking) return res.status(409).json({ message: "The booking price or final due date changed. Refresh and try again." });
        await createActivityLog({
            req, action: "UPDATE", module: "Payment",
            description: `Hotel advance schedule updated for booking ${booking.bookingCode}`,
            relatedRecordId: booking._id, relatedModel: "Booking",
            referenceNo: booking.bookingCode, customerName: booking.customer?.fullName,
            metadata: plan.value,
        });
        return res.json({ hotelAdvanceAmount: booking.hotelAdvanceAmount,
            hotelAdvanceDueDate: booking.hotelAdvanceDueDate });
    } catch (error) {
        console.error("Hotel advance update failed:", error.message);
        return res.status(500).json({ message: "Failed to update hotel advance schedule" });
    }
};

const logPaymentContact = async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: "Invalid booking ID" });
    }
    const channel = req.body?.channel;
    if (!CONTACT_CHANNELS.includes(channel)) {
        return res.status(400).json({ message: "Choose a contact channel" });
    }
    const parsed = parseCalendarDate(req.body?.nextFollowUpDate ?? null, "Next follow-up date");
    if (parsed.error) return res.status(400).json({ message: parsed.error });

    try {
        // Only open balances can be contacted from this queue; guard stale browser tabs too.
        const booking = await Booking.findOneAndUpdate(
            {
                _id: req.params.id,
                bookingStatus: { $in: OPEN_BOOKING_STATUSES },
                totalPrice: { $gt: 0 },
                $expr: { $gt: ["$totalPrice", { $ifNull: ["$advancePayment", 0] }] },
            },
            { $set: { paymentContact: {
                lastContactedAt: new Date(),
                lastContactedBy: req.admin._id,
                channel,
                nextFollowUpDate: parsed.value,
            } } },
            { new: true, runValidators: true }
        );
        if (!booking) {
            const exists = await Booking.exists({ _id: req.params.id });
            return res.status(exists ? 409 : 404).json({
                message: exists ? "This booking no longer has an open balance" : "Booking not found",
            });
        }

        await createActivityLog({
            req,
            action: "UPDATE",
            module: "Payment",
            description: `Payment contact logged (${channel}) for booking ${booking.bookingCode}`,
            relatedRecordId: booking._id,
            relatedModel: "Booking",
            referenceNo: booking.bookingCode,
            customerName: booking.customer?.fullName,
            metadata: { channel, nextFollowUpDate: parsed.value },
        });
        const { lastContactedAt, nextFollowUpDate } = booking.paymentContact;
        return res.status(200).json({ paymentContact: { lastContactedAt, channel, nextFollowUpDate } });
    } catch (error) {
        console.error("Payment contact log failed:", error.message);
        return res.status(500).json({ message: "Failed to log payment contact" });
    }
};

module.exports = { getOutstandingBalances, getPaymentAttention, updatePaymentDueDate, updateHotelAdvance, logPaymentContact };
