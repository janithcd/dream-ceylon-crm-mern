const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const { createActivityLog } = require("../utils/createActivityLog");
const { parseTravelerNames } = require("../utils/travelerRoster");

const validId = (id) => mongoose.Types.ObjectId.isValid(id);
const rosterResponse = (booking) => ({
    bookingCode: booking.bookingCode,
    bookingStatus: booking.bookingStatus,
    numberOfTravelers: booking.numberOfTravelers,
    travelerNames: booking.travelerNames || [],
    version: booking.travelerRosterVersion ?? 0,
});

const getTravelerRoster = async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid booking ID" });
    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking) return res.status(404).json({ message: "Booking not found" });
        return res.json(rosterResponse(booking));
    } catch {
        return res.status(500).json({ message: "Failed to load traveler roster" });
    }
};

const saveTravelerRoster = async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid booking ID" });
    const expectedVersion = req.body?.expectedVersion;
    const expectedHeadcount = req.body?.expectedHeadcount;
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0 ||
        !Number.isSafeInteger(expectedHeadcount) || expectedHeadcount < 1) {
        return res.status(400).json({ message: "Refresh the roster before saving." });
    }
    try {
        const current = await Booking.findById(req.params.id);
        if (!current) return res.status(404).json({ message: "Booking not found" });
        if (current.numberOfTravelers !== expectedHeadcount) {
            return res.status(409).json({ message: "The booking headcount changed. Reload the roster before saving." });
        }
        const parsed = parseTravelerNames(req.body?.travelerNames, current.numberOfTravelers);
        if (parsed.error) return res.status(400).json({ message: parsed.error });

        const booking = await Booking.findOneAndUpdate({
            _id: current._id,
            numberOfTravelers: expectedHeadcount,
            travelerRosterVersion: expectedVersion === 0 ? { $in: [null, 0] } : expectedVersion,
        }, {
            $set: { travelerNames: parsed.names },
            $inc: { travelerRosterVersion: 1 },
        }, { returnDocument: "after", runValidators: true });
        if (!booking) {
            return res.status(409).json({ message: "The roster or booking headcount changed. Reload it before saving." });
        }

        await createActivityLog({
            req,
            action: "UPDATE",
            module: "Booking",
            description: `Traveler roster updated for booking ${booking.bookingCode}`,
            relatedRecordId: booking._id,
            relatedModel: "Booking",
            referenceNo: booking.bookingCode,
            customerName: booking.customer?.fullName,
            metadata: { namedTravelerCount: parsed.names.length, numberOfTravelers: booking.numberOfTravelers },
        });
        return res.json(rosterResponse(booking));
    } catch (error) {
        if (error.name === "ValidationError") return res.status(400).json({ message: "Traveler roster is invalid" });
        return res.status(500).json({ message: "Failed to save traveler roster" });
    }
};

module.exports = { getTravelerRoster, saveTravelerRoster };
