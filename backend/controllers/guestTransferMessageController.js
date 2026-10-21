const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const { getDocumentBrandConfig } = require("../utils/documentSettings");
const { buildGuestTransferMessage } = require("../utils/guestTransferMessage");

const getGuestTransferMessage = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id) || !mongoose.Types.ObjectId.isValid(req.params.assignmentId)) {
            return res.status(400).json({ message: "Invalid booking or transport ID" });
        }
        // Reload on each request so a draft never relies on an old queue snapshot.
        const booking = await Booking.findById(req.params.id)
            .select("bookingCode bookingStatus customer.fullName customer.whatsappNumber transportAssignments");
        if (!booking) return res.status(404).json({ message: "Booking not found" });
        const assignment = booking.transportAssignments.id(req.params.assignmentId);
        if (!assignment) return res.status(404).json({ message: "Transport arrangement not found in this booking" });
        const company = await getDocumentBrandConfig();
        const result = buildGuestTransferMessage(booking, assignment, company);
        if (result.error) return res.status(409).json({ message: result.error });
        // Preparing a draft is read-only; it does not log contact or mark a message sent.
        return res.json(result.value);
    } catch (error) {
        console.error("Guest transfer message failed:", error.message);
        return res.status(500).json({ message: "Failed to prepare guest pickup message" });
    }
};

module.exports = { getGuestTransferMessage };
