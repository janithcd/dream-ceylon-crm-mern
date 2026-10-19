const Booking = require("../models/Booking");
const mongoose = require("mongoose");
const { createActivityLog } = require("../utils/createActivityLog");
const { parsePaymentDueDate } = require("../utils/paymentDueDate");
const { buildOutstandingBalancesPipeline, DATE_FILTERS, DUE_FILTERS, PAGE_SIZE } = require("../utils/outstandingBalances");

const getOutstandingBalances = async (req, res) => {
    const dateFilter = req.query.dateFilter || "next30";
    const dueFilter = req.query.dueFilter || "all";
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    if (!DATE_FILTERS.includes(dateFilter) || !DUE_FILTERS.includes(dueFilter) ||
        !Number.isSafeInteger(page) || page < 1 || page > 10000) {
        return res.status(400).json({ message: "Invalid outstanding balance filter or page" });
    }

    try {
        const [result] = await Booking.aggregate(buildOutstandingBalancesPipeline({ dateFilter, dueFilter, page }));
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
            },
            total, page, totalPages: Math.ceil(total / PAGE_SIZE) || 1,
        });
    } catch (error) {
        console.error("Outstanding balance queue failed:", error.message);
        return res.status(500).json({ message: "Failed to load outstanding balances" });
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
        const booking = await Booking.findByIdAndUpdate(
            req.params.id,
            { $set: { paymentDueDate: parsed.value } },
            { new: true, runValidators: true }
        );
        if (!booking) return res.status(404).json({ message: "Booking not found" });

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

module.exports = { getOutstandingBalances, updatePaymentDueDate };
