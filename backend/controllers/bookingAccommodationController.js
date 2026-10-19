const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const { parseHotelStay } = require("../utils/bookingAccommodation");
const { createActivityLog } = require("../utils/createActivityLog");

const validId = (value) => mongoose.Types.ObjectId.isValid(value);

const logChange = async (req, booking, description, metadata) => {
    await createActivityLog({
        req,
        action: "UPDATE",
        module: "Booking",
        description,
        relatedRecordId: booking._id,
        relatedModel: "Booking",
        referenceNo: booking.bookingCode,
        customerName: booking.customer?.fullName,
        metadata,
    });
};

const addHotelStay = async (req, res) => {
    try {
        if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid booking ID" });
        const { value, error } = parseHotelStay(req.body || {});
        if (error) return res.status(400).json({ message: error });

        const booking = await Booking.findOneAndUpdate(
            { _id: req.params.id, "hotelStays.49": { $exists: false } },
            { $push: { hotelStays: value } },
            { new: true, runValidators: true }
        );
        if (!booking) {
            const exists = await Booking.exists({ _id: req.params.id });
            return res.status(exists ? 409 : 404).json({
                message: exists ? "A booking can have at most 50 hotel stays" : "Booking not found",
            });
        }

        await logChange(req, booking, `Hotel stay added to booking ${booking.bookingCode}`, {
            hotelName: value.hotelName,
            status: value.status,
            followUpDate: value.followUpDate,
        });
        return res.status(201).json({ hotelStays: booking.hotelStays });
    } catch (error) {
        return res.status(500).json({ message: "Failed to add hotel stay" });
    }
};

const updateHotelStay = async (req, res) => {
    try {
        if (!validId(req.params.id) || !validId(req.params.stayId)) {
            return res.status(400).json({ message: "Invalid booking or stay ID" });
        }

        const currentBooking = await Booking.findById(req.params.id).select("hotelStays");
        const existing = currentBooking?.hotelStays.id(req.params.stayId);
        if (!existing) return res.status(404).json({ message: "Hotel stay not found" });

        const { value, error } = parseHotelStay(req.body || {}, existing);
        if (error) return res.status(400).json({ message: error });
        const fields = Object.fromEntries(
            Object.entries(value).map(([key, fieldValue]) => [`hotelStays.$.${key}`, fieldValue])
        );

        const booking = await Booking.findOneAndUpdate(
            { _id: req.params.id, "hotelStays._id": req.params.stayId },
            { $set: fields },
            { new: true, runValidators: true }
        );
        if (!booking) return res.status(404).json({ message: "Hotel stay not found" });

        await logChange(req, booking, `Hotel stay updated for booking ${booking.bookingCode}`, {
            stayId: req.params.stayId,
            hotelName: value.hotelName,
            status: value.status,
            followUpDate: value.followUpDate,
        });
        return res.status(200).json({ hotelStays: booking.hotelStays });
    } catch (error) {
        return res.status(500).json({ message: "Failed to update hotel stay" });
    }
};

const deleteHotelStay = async (req, res) => {
    try {
        if (!validId(req.params.id) || !validId(req.params.stayId)) {
            return res.status(400).json({ message: "Invalid booking or stay ID" });
        }

        const booking = await Booking.findOneAndUpdate(
            { _id: req.params.id, "hotelStays._id": req.params.stayId },
            { $pull: { hotelStays: { _id: req.params.stayId } } },
            { new: true }
        );
        if (!booking) return res.status(404).json({ message: "Hotel stay not found" });

        await logChange(req, booking, `Hotel stay removed from booking ${booking.bookingCode}`, { stayId: req.params.stayId });
        return res.status(200).json({ hotelStays: booking.hotelStays });
    } catch (error) {
        return res.status(500).json({ message: "Failed to remove hotel stay" });
    }
};

module.exports = { addHotelStay, updateHotelStay, deleteHotelStay };
