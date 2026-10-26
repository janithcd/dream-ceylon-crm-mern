const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const { createActivityLog } = require("../utils/createActivityLog");
const { ACTIVE_BOOKING_STATUSES } = require("../utils/myTasks");
const { buildHotelRoomingDetails } = require("../utils/hotelRoomingDetails");
const { parseRoomingAssignments, roomingPlanState } = require("../utils/roomingPlan");

const validId = (value) => mongoose.Types.ObjectId.isValid(value);
const validRevision = (value) => Number.isSafeInteger(value) && value >= 0;
const revisionMatch = (version) => version === 0 ? { $in: [null, 0] } : version;

const record = async (req, booking, stayId, description, metadata) => createActivityLog({
    req, action: "UPDATE", module: "Booking", description,
    relatedRecordId: booking._id, relatedModel: "Booking", referenceNo: booking.bookingCode,
    customerName: booking.customer?.fullName, metadata: { stayId, ...metadata },
});

const saveHotelRoomingPlan = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!validId(req.params.id) || !validId(req.params.stayId)) {
        return res.status(400).json({ message: "Invalid booking or hotel stay ID" });
    }
    const { expectedRevision, expectedRosterVersion, expectedRooms, assignments } = req.body || {};
    if (!validRevision(expectedRevision) || !validRevision(expectedRosterVersion) ||
        !Number.isInteger(expectedRooms) || expectedRooms < 1 || expectedRooms > 20) {
        return res.status(400).json({ message: "Reload the rooming details before saving." });
    }
    try {
        const current = await Booking.findById(req.params.id);
        if (!current) return res.status(404).json({ message: "Booking not found" });
        const stay = current.hotelStays.id(req.params.stayId);
        if (!stay) return res.status(404).json({ message: "Hotel stay not found in this booking" });
        const details = buildHotelRoomingDetails(current, stay);
        if (details.error) return res.status(409).json({ message: details.error });
        if ((current.travelerRosterVersion ?? 0) !== expectedRosterVersion || stay.rooms !== expectedRooms ||
            (stay.roomingRevision ?? 0) !== expectedRevision) {
            return res.status(409).json({ message: "The roster, room count or plan changed. Reload before saving." });
        }
        const parsed = parseRoomingAssignments(assignments, current.travelerNames.length, stay.rooms);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const savedAt = new Date();
        const booking = await Booking.findOneAndUpdate({
            _id: current._id,
            bookingStatus: { $in: ACTIVE_BOOKING_STATUSES },
            numberOfTravelers: current.numberOfTravelers,
            travelerRosterVersion: revisionMatch(expectedRosterVersion),
            hotelStays: { $elemMatch: {
                _id: stay._id, status: "Confirmed", rooms: expectedRooms,
                roomingRevision: revisionMatch(expectedRevision),
            } },
        }, {
            $set: { "hotelStays.$.roomingPlan": {
                assignments: parsed.assignments, rosterVersion: expectedRosterVersion,
                roomCount: expectedRooms, savedAt,
                savedBy: req.admin?._id || null, savedByName: req.admin?.name || "",
            } },
            $inc: { "hotelStays.$.roomingRevision": 1 },
        }, { returnDocument: "after", runValidators: true });
        if (!booking) return res.status(409).json({ message: "The roster or hotel stay changed. Reload before saving." });
        await record(req, booking, stay._id, `Hotel rooming plan saved for booking ${booking.bookingCode}`, {
            rooms: expectedRooms, includedCount: parsed.includedCount,
            excludedCount: parsed.assignments.length - parsed.includedCount,
        });
        return res.json({ roomingPlan: roomingPlanState(booking, booking.hotelStays.id(stay._id)) });
    } catch (error) {
        if (error.name === "ValidationError") return res.status(400).json({ message: "Rooming plan is invalid" });
        return res.status(500).json({ message: "Failed to save hotel rooming plan" });
    }
};

const clearHotelRoomingPlan = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!validId(req.params.id) || !validId(req.params.stayId)) {
        return res.status(400).json({ message: "Invalid booking or hotel stay ID" });
    }
    const expectedRevision = req.body?.expectedRevision;
    if (!validRevision(expectedRevision)) return res.status(400).json({ message: "Reload the rooming details before clearing." });
    try {
        const current = await Booking.findById(req.params.id);
        if (!current) return res.status(404).json({ message: "Booking not found" });
        const stay = current.hotelStays.id(req.params.stayId);
        if (!stay) return res.status(404).json({ message: "Hotel stay not found in this booking" });
        if (!ACTIVE_BOOKING_STATUSES.includes(current.bookingStatus) || stay.status !== "Confirmed") {
            return res.status(409).json({ message: "Only confirmed stays on active bookings can change rooming plans." });
        }
        if (!stay.roomingPlan || (stay.roomingRevision ?? 0) !== expectedRevision) {
            return res.status(409).json({ message: "The saved rooming plan changed. Reload before clearing." });
        }
        const booking = await Booking.findOneAndUpdate({
            _id: current._id, bookingStatus: { $in: ACTIVE_BOOKING_STATUSES },
            hotelStays: { $elemMatch: {
                _id: stay._id, status: "Confirmed", roomingPlan: { $ne: null },
                roomingRevision: revisionMatch(expectedRevision),
            } },
        }, {
            $set: { "hotelStays.$.roomingPlan": null },
            $inc: { "hotelStays.$.roomingRevision": 1 },
        }, { returnDocument: "after", runValidators: true });
        if (!booking) return res.status(409).json({ message: "The saved rooming plan changed. Reload before clearing." });
        await record(req, booking, stay._id, `Hotel rooming plan cleared for booking ${booking.bookingCode}`, {});
        return res.json({ roomingPlan: roomingPlanState(booking, booking.hotelStays.id(stay._id)) });
    } catch (error) {
        return res.status(500).json({ message: "Failed to clear hotel rooming plan" });
    }
};

module.exports = { saveHotelRoomingPlan, clearHotelRoomingPlan };
