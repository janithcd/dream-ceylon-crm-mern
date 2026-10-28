const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const { getDocumentBrandConfig } = require("../utils/documentSettings");
const { buildPreArrivalMessage } = require("../utils/preArrivalMessage");

const getPreArrivalMessage = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: "Invalid booking ID" });
        }
        const booking = await Booking.findById(req.params.id).select(
            "bookingCode bookingStatus customer.fullName customer.whatsappNumber travelStartDate travelEndDate hotelStays.hotelName hotelStays.location hotelStays.checkInDate hotelStays.checkOutDate hotelStays.status transportAssignments.status transportAssignments.flight"
        );
        if (!booking) return res.status(404).json({ message: "Booking not found" });
        // Validate eligibility before loading company settings. Refresh the booking
        // on each request so drafts never rely on an old departure queue snapshot.
        const eligibility = buildPreArrivalMessage(booking);
        if (eligibility.error) return res.status(409).json({ message: eligibility.error });
        const company = await getDocumentBrandConfig();
        const result = buildPreArrivalMessage(booking, company);
        // Drafting is read-only: sending and recording guest contact remain manual.
        return res.json(result.value);
    } catch (error) {
        console.error("Pre-arrival message failed:", error.message);
        return res.status(500).json({ message: "Failed to prepare pre-arrival message" });
    }
};

module.exports = { getPreArrivalMessage };
