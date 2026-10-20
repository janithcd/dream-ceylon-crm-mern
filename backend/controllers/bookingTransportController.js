const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const { parseTransportAssignment, datesOverlap } = require("../utils/bookingTransport");
const { createActivityLog } = require("../utils/createActivityLog");

const validId = (value) => mongoose.Types.ObjectId.isValid(value);

const getConflicts = async (booking) => {
    if (["Cancelled", "Completed"].includes(booking.bookingStatus)) return [];

    const confirmed = booking.transportAssignments.filter((item) => item.status === "Confirmed" && item.registrationKey);
    if (!confirmed.length) return [];

    const keys = [...new Set(confirmed.map((item) => item.registrationKey))];
    const firstDate = new Date(Math.min(...confirmed.map((item) => item.startDate.getTime())));
    const lastDate = new Date(Math.max(...confirmed.map((item) => item.endDate.getTime())));
    const others = await Booking.find({
        _id: { $ne: booking._id },
        bookingStatus: { $nin: ["Cancelled", "Completed"] },
        transportAssignments: { $elemMatch: {
            status: "Confirmed",
            registrationKey: { $in: keys },
            startDate: { $lte: lastDate },
            endDate: { $gte: firstDate },
        } },
    }).select("bookingCode transportAssignments").lean();

    const overlapping = [booking, ...others];
    return confirmed.map((item) => ({
        assignmentId: item._id,
        bookings: overlapping.flatMap((other) => other.transportAssignments
            .filter((candidate) =>
                String(candidate._id) !== String(item._id) &&
                candidate.status === "Confirmed" &&
                candidate.registrationKey === item.registrationKey &&
                datesOverlap(item, candidate)
            )
            .map((candidate) => ({
                bookingCode: other.bookingCode,
                route: candidate.route,
                startDate: candidate.startDate,
                endDate: candidate.endDate,
            }))),
    })).filter((item) => item.bookings.length);
};

const sendAssignments = async (res, booking, status = 200) => {
    let conflicts = [];
    let conflictCheckUnavailable = false;
    try {
        conflicts = await getConflicts(booking);
    } catch (error) {
        console.error("Transport overlap check failed:", error.message);
        conflictCheckUnavailable = true;
    }
    return res.status(status).json({
        assignments: booking.transportAssignments,
        conflicts,
        conflictCheckUnavailable,
    });
};

const logChange = async (req, booking, description, assignment) => {
    await createActivityLog({
        req,
        action: "UPDATE",
        module: "Booking",
        description,
        relatedRecordId: booking._id,
        relatedModel: "Booking",
        referenceNo: booking.bookingCode,
        customerName: booking.customer?.fullName,
        metadata: { route: assignment?.route, status: assignment?.status, followUpDate: assignment?.followUpDate },
    });
};

const getTransportAssignments = async (req, res) => {
    try {
        if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid booking ID" });
        const booking = await Booking.findById(req.params.id).select("bookingCode bookingStatus transportAssignments");
        if (!booking) return res.status(404).json({ message: "Booking not found" });
        return sendAssignments(res, booking);
    } catch (error) {
        return res.status(500).json({ message: "Failed to load transport arrangements" });
    }
};

const addTransportAssignment = async (req, res) => {
    try {
        if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid booking ID" });
        const { value, error } = parseTransportAssignment(req.body || {});
        if (error) return res.status(400).json({ message: error });

        const booking = await Booking.findOneAndUpdate(
            { _id: req.params.id, "transportAssignments.29": { $exists: false } },
            { $push: { transportAssignments: value } },
            { new: true, runValidators: true }
        );
        if (!booking) {
            const exists = await Booking.exists({ _id: req.params.id });
            return res.status(exists ? 409 : 404).json({
                message: exists ? "A booking can have at most 30 transport arrangements" : "Booking not found",
            });
        }

        await logChange(req, booking, `Transport arranged for booking ${booking.bookingCode}: ${value.route}`, value);
        return sendAssignments(res, booking, 201);
    } catch (error) {
        return res.status(500).json({ message: "Failed to add transport arrangement" });
    }
};

const updateTransportAssignment = async (req, res) => {
    try {
        if (!validId(req.params.id) || !validId(req.params.assignmentId)) {
            return res.status(400).json({ message: "Invalid booking or transport ID" });
        }
        const currentBooking = await Booking.findById(req.params.id).select("transportAssignments");
        const existing = currentBooking?.transportAssignments.id(req.params.assignmentId);
        if (!existing) return res.status(404).json({ message: "Transport arrangement not found" });

        const { value, error } = parseTransportAssignment(req.body || {}, existing);
        if (error) return res.status(400).json({ message: error });
        // Status-only changes must not rewrite flight details loaded before a concurrent edit.
        const fields = Object.fromEntries(Object.entries(value)
            .filter(([key]) => key !== "flight" || Object.hasOwn(req.body || {}, "flight"))
            .map(([key, fieldValue]) => [`transportAssignments.$.${key}`, fieldValue]));
        const booking = await Booking.findOneAndUpdate(
            { _id: req.params.id, "transportAssignments._id": req.params.assignmentId },
            { $set: fields },
            { new: true, runValidators: true }
        );
        if (!booking) return res.status(404).json({ message: "Transport arrangement not found" });

        await logChange(req, booking, `Transport updated for booking ${booking.bookingCode}: ${value.route}`, value);
        return sendAssignments(res, booking);
    } catch (error) {
        return res.status(500).json({ message: "Failed to update transport arrangement" });
    }
};

const deleteTransportAssignment = async (req, res) => {
    try {
        if (!validId(req.params.id) || !validId(req.params.assignmentId)) {
            return res.status(400).json({ message: "Invalid booking or transport ID" });
        }
        const booking = await Booking.findOneAndUpdate(
            { _id: req.params.id, "transportAssignments._id": req.params.assignmentId },
            { $pull: { transportAssignments: { _id: req.params.assignmentId } } },
            { new: true }
        );
        if (!booking) return res.status(404).json({ message: "Transport arrangement not found" });

        await logChange(req, booking, `Transport arrangement removed from booking ${booking.bookingCode}`);
        return sendAssignments(res, booking);
    } catch (error) {
        return res.status(500).json({ message: "Failed to remove transport arrangement" });
    }
};

module.exports = { getTransportAssignments, addTransportAssignment, updateTransportAssignment, deleteTransportAssignment };
