const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const { getDocumentBrandConfig } = require("../utils/documentSettings");
const { buildPreArrivalMessage } = require("../utils/preArrivalMessage");
const { getBusinessDayBounds } = require("../utils/businessDate");
const { createActivityLog } = require("../utils/createActivityLog");

const contactSummary = (booking) => ({
    sentAt: booking.preArrivalContact?.sentAt || null,
    sentByName: booking.preArrivalContact?.sentByName || "",
    channel: booking.preArrivalContact?.channel || null,
});

const getPreArrivalMessage = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: "Invalid booking ID" });
        }
        const booking = await Booking.findById(req.params.id).select(
            "bookingCode bookingStatus customer.fullName customer.whatsappNumber travelStartDate travelEndDate hotelStays.hotelName hotelStays.location hotelStays.checkInDate hotelStays.checkOutDate hotelStays.status transportAssignments.status transportAssignments.flight preArrivalContact.sentAt preArrivalContact.sentByName preArrivalContact.channel preArrivalRevision"
        );
        if (!booking) return res.status(404).json({ message: "Booking not found" });
        // Validate eligibility before loading company settings. Refresh the booking
        // on each request so drafts never rely on an old departure queue snapshot.
        const eligibility = buildPreArrivalMessage(booking);
        if (eligibility.error) return res.status(409).json({ message: eligibility.error });
        const company = await getDocumentBrandConfig();
        const result = buildPreArrivalMessage(booking, company);
        // Drafting is read-only: sending and recording guest contact remain manual.
        return res.json({ ...result.value, contact: contactSummary(booking), revision: booking.preArrivalRevision ?? 0 });
    } catch (error) {
        console.error("Pre-arrival message failed:", error.message);
        return res.status(500).json({ message: "Failed to prepare pre-arrival message" });
    }
};

const recordPreArrivalContact = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid booking ID" });
    const { action, channel, expectedRevision, reason } = req.body || {};
    if (!["sent", "clear"].includes(action) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
        return res.status(400).json({ message: "Choose a valid action and refresh the pre-arrival record" });
    }
    if (action === "sent" && !["WhatsApp", "Email", "Other"].includes(channel)) {
        return res.status(400).json({ message: "Choose how the message was sent" });
    }
    if (action === "clear" && (typeof reason !== "string" || reason.trim().length < 10 || reason.trim().length > 300)) {
        return res.status(400).json({ message: "Explain the correction in 10 to 300 characters" });
    }
    try {
        const current = await Booking.findById(req.params.id)
            .select("bookingCode bookingStatus customer.fullName travelStartDate travelEndDate preArrivalContact preArrivalRevision");
        if (!current) return res.status(404).json({ message: "Booking not found" });
        if (buildPreArrivalMessage(current).error) {
            return res.status(409).json({ message: "Pre-arrival contact is available only for confirmed bookings before the trip starts" });
        }
        if ((current.preArrivalRevision ?? 0) !== expectedRevision) {
            return res.status(409).json({ message: "The pre-arrival record changed. Refresh and try again" });
        }
        if (action === "sent" && current.preArrivalContact?.sentAt || action === "clear" && !current.preArrivalContact?.sentAt) {
            return res.status(409).json({ message: "The pre-arrival record changed. Refresh and try again" });
        }
        const now = new Date();
        const contact = action === "sent" ? {
            sentAt: now, sentBy: req.admin._id, sentByName: (req.admin.name || "").slice(0, 120), channel,
        } : null;
        const updated = await Booking.findOneAndUpdate({
            _id: current._id, bookingStatus: "Confirmed",
            travelStartDate: { $eq: current.travelStartDate, $gte: getBusinessDayBounds(now).start },
            travelEndDate: current.travelEndDate,
            preArrivalRevision: expectedRevision === 0 ? { $in: [null, 0] } : expectedRevision,
            ...(action === "sent" ? { preArrivalContact: null } : { "preArrivalContact.sentAt": current.preArrivalContact.sentAt }),
        }, { $set: { preArrivalContact: contact }, $inc: { preArrivalRevision: 1 } },
        { returnDocument: "after", runValidators: true });
        if (!updated) return res.status(409).json({ message: "The booking or pre-arrival record changed. Refresh and try again" });
        await createActivityLog({ req, action: "UPDATE", module: "Booking",
            description: action === "sent" ? `Pre-arrival message sent for booking ${updated.bookingCode}`
                : `Pre-arrival sent record corrected for booking ${updated.bookingCode}`,
            relatedRecordId: updated._id, relatedModel: "Booking", referenceNo: updated.bookingCode,
            customerName: updated.customer?.fullName,
            metadata: action === "sent" ? { channel } : { reason: reason.trim() },
        });
        return res.json({ contact: contactSummary(updated), revision: updated.preArrivalRevision });
    } catch (error) {
        if (error.name === "ValidationError") return res.status(400).json({ message: "Invalid pre-arrival contact record" });
        console.error("Pre-arrival contact failed:", error.message);
        return res.status(500).json({ message: "Failed to update pre-arrival contact record" });
    }
};

module.exports = { getPreArrivalMessage, recordPreArrivalContact };
