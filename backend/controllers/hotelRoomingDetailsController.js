const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const { getDocumentBrandConfig } = require("../utils/documentSettings");
const { buildHotelRoomingDetails } = require("../utils/hotelRoomingDetails");

const getHotelRoomingDetails = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!mongoose.Types.ObjectId.isValid(req.params.id) || !mongoose.Types.ObjectId.isValid(req.params.stayId)) {
        return res.status(400).json({ message: "Invalid booking or hotel stay ID" });
    }
    try {
        const booking = await Booking.findById(req.params.id)
            .select("bookingCode bookingStatus numberOfTravelers travelerNames hotelStays");
        if (!booking) return res.status(404).json({ message: "Booking not found" });
        const stay = booking.hotelStays.id(req.params.stayId);
        if (!stay) return res.status(404).json({ message: "Hotel stay not found in this booking" });
        const result = buildHotelRoomingDetails(booking, stay, await getDocumentBrandConfig());
        if (result.error) return res.status(409).json({ message: result.error });
        return res.status(200).json(result.value);
    } catch (error) {
        console.error("Hotel rooming details failed:", error.message);
        return res.status(500).json({ message: "Failed to prepare hotel rooming details" });
    }
};

module.exports = { getHotelRoomingDetails };
