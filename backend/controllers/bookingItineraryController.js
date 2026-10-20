const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const { parseItineraryDay } = require("../utils/bookingItinerary");
const { createActivityLog } = require("../utils/createActivityLog");

const validId = (value) => mongoose.Types.ObjectId.isValid(value);

const sendDays = (res, booking, status = 200) => res.status(status).json({
    travelStartDate: booking.travelStartDate,
    travelEndDate: booking.travelEndDate,
    bookingStatus: booking.bookingStatus,
    days: [...booking.itineraryDays].sort((a, b) =>
        new Date(a.date) - new Date(b.date) || new Date(a.createdAt) - new Date(b.createdAt)
    ),
});

const logChange = async (req, booking, action, day) => {
    await createActivityLog({
        req,
        action: "UPDATE",
        module: "Booking",
        description: `Itinerary entry ${action} for booking ${booking.bookingCode}`,
        relatedRecordId: booking._id,
        relatedModel: "Booking",
        referenceNo: booking.bookingCode,
        customerName: booking.customer?.fullName,
        metadata: { itineraryDayId: day._id, date: day.date, title: day.title },
    });
};

const getItinerary = async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid booking ID" });
    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking) return res.status(404).json({ message: "Booking not found" });
        return sendDays(res, booking);
    } catch (error) {
        return res.status(500).json({ message: "Failed to load itinerary" });
    }
};

const addItineraryDay = async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid booking ID" });
    try {
        const current = await Booking.findById(req.params.id);
        if (!current) return res.status(404).json({ message: "Booking not found" });
        if (current.bookingStatus === "Cancelled") return res.status(409).json({ message: "Cancelled bookings cannot be planned" });
        const { value, error } = parseItineraryDay(req.body, current);
        if (error) return res.status(400).json({ message: error });

        const booking = await Booking.findOneAndUpdate(
            {
                _id: req.params.id,
                bookingStatus: { $ne: "Cancelled" },
                travelStartDate: current.travelStartDate,
                travelEndDate: current.travelEndDate,
                "itineraryDays.59": { $exists: false },
            },
            { $push: { itineraryDays: value } },
            { new: true, runValidators: true }
        );
        if (!booking) return res.status(409).json({ message: "Trip changed or itinerary is full; refresh and try again" });
        const day = booking.itineraryDays.at(-1);
        await logChange(req, booking, "added", day);
        return sendDays(res, booking, 201);
    } catch (error) {
        return res.status(500).json({ message: "Failed to add itinerary entry" });
    }
};

const updateItineraryDay = async (req, res) => {
    if (!validId(req.params.id) || !validId(req.params.dayId)) {
        return res.status(400).json({ message: "Invalid booking or itinerary entry ID" });
    }
    try {
        const current = await Booking.findById(req.params.id);
        if (!current) return res.status(404).json({ message: "Booking not found" });
        if (!current.itineraryDays.id(req.params.dayId)) return res.status(404).json({ message: "Itinerary entry not found" });
        if (current.bookingStatus === "Cancelled") return res.status(409).json({ message: "Cancelled bookings cannot be planned" });
        const { value, error } = parseItineraryDay(req.body, current);
        if (error) return res.status(400).json({ message: error });

        const booking = await Booking.findOneAndUpdate(
            {
                _id: req.params.id,
                "itineraryDays._id": req.params.dayId,
                bookingStatus: { $ne: "Cancelled" },
                travelStartDate: current.travelStartDate,
                travelEndDate: current.travelEndDate,
            },
            { $set: Object.fromEntries(Object.entries(value).map(([field, entry]) => [`itineraryDays.$.${field}`, entry])) },
            { new: true, runValidators: true }
        );
        if (!booking) return res.status(409).json({ message: "Trip or itinerary changed; refresh and try again" });
        await logChange(req, booking, "updated", booking.itineraryDays.id(req.params.dayId));
        return sendDays(res, booking);
    } catch (error) {
        return res.status(500).json({ message: "Failed to update itinerary entry" });
    }
};

const deleteItineraryDay = async (req, res) => {
    if (!validId(req.params.id) || !validId(req.params.dayId)) {
        return res.status(400).json({ message: "Invalid booking or itinerary entry ID" });
    }
    try {
        const current = await Booking.findById(req.params.id);
        if (!current) return res.status(404).json({ message: "Booking not found" });
        const day = current.itineraryDays.id(req.params.dayId);
        if (!day) return res.status(404).json({ message: "Itinerary entry not found" });
        if (current.bookingStatus === "Cancelled") return res.status(409).json({ message: "Cancelled bookings cannot be planned" });
        const booking = await Booking.findOneAndUpdate(
            { _id: req.params.id, "itineraryDays._id": req.params.dayId, bookingStatus: { $ne: "Cancelled" } },
            { $pull: { itineraryDays: { _id: req.params.dayId } } },
            { new: true }
        );
        if (!booking) return res.status(409).json({ message: "Itinerary changed; refresh and try again" });
        await logChange(req, booking, "removed", day);
        return sendDays(res, booking);
    } catch (error) {
        return res.status(500).json({ message: "Failed to remove itinerary entry" });
    }
};

module.exports = { getItinerary, addItineraryDay, updateItineraryDay, deleteItineraryDay };
