const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const { createActivityLog } = require("../utils/createActivityLog");
const { STARTER_TASKS, starterOptions } = require("../utils/preparationStarter");

const ACTIVE_STATUSES = ["Pending", "Confirmed", "In Progress"];
const readBooking = (id) => Booking.findById(id).select("bookingCode customer.fullName bookingStatus travelStartDate preparationTasks");

const getPreparationStarter = async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid booking ID" });
    try {
        const booking = await readBooking(req.params.id);
        if (!booking) return res.status(404).json({ message: "Booking not found" });
        return res.json({
            bookingStatus: booking.bookingStatus,
            departureDate: booking.travelStartDate?.toISOString().slice(0, 10) || null,
            options: starterOptions(booking),
        });
    } catch (error) {
        return res.status(500).json({ message: "Failed to load starter checklist" });
    }
};

const applyPreparationStarter = async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid booking ID" });
    const { keys, includeDueDates, departureDate } = req.body || {};
    const knownKeys = new Set(STARTER_TASKS.map((item) => item.key));
    if (!Array.isArray(keys) || !keys.length || keys.length > STARTER_TASKS.length ||
        keys.some((key) => typeof key !== "string" || !knownKeys.has(key)) || new Set(keys).size !== keys.length ||
        typeof includeDueDates !== "boolean" || typeof departureDate !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(departureDate)) {
        return res.status(400).json({ message: "Choose one or more starter tasks and a due date preference" });
    }
    try {
        const booking = await readBooking(req.params.id);
        if (!booking) return res.status(404).json({ message: "Booking not found" });
        if (booking.travelStartDate?.toISOString().slice(0, 10) !== departureDate) {
            return res.status(409).json({ message: "Trip departure changed. Refresh the checklist and try again." });
        }
        if (!ACTIVE_STATUSES.includes(booking.bookingStatus)) {
            return res.status(409).json({ message: "Starter tasks can only be added to an active booking" });
        }
        const options = starterOptions(booking);
        const selected = keys.map((key) => options.find((item) => item.key === key));
        if (selected.some((item) => item.alreadyAdded)) {
            return res.status(409).json({ message: "A selected task already exists. Refresh the checklist and try again." });
        }
        if (booking.preparationTasks.length + selected.length > 30) {
            return res.status(409).json({ message: "A booking can have at most 30 preparation tasks" });
        }

        // The conditions protect against a concurrent task addition, trip change, or status change.
        const updated = await Booking.findOneAndUpdate(
            {
                _id: booking._id,
                bookingStatus: { $in: ACTIVE_STATUSES },
                travelStartDate: booking.travelStartDate,
                $expr: { $lte: [{ $size: { $ifNull: ["$preparationTasks", []] } }, 30 - selected.length] },
                $nor: selected.map(({ title }) => ({ "preparationTasks.title": { $regex: `^${title}$`, $options: "i" } })),
            },
            { $push: { preparationTasks: { $each: selected.map(({ title, dueDate }) => ({
                title, dueDate: includeDueDates ? dueDate : null,
            })) } } },
            { new: true, runValidators: true }
        );
        if (!updated) return res.status(409).json({ message: "Booking or checklist changed. Refresh and try again." });

        await createActivityLog({
            req, action: "UPDATE", module: "Booking",
            description: `Starter checklist added to booking ${updated.bookingCode}`,
            relatedRecordId: updated._id, relatedModel: "Booking",
            referenceNo: updated.bookingCode, customerName: updated.customer?.fullName,
            metadata: { taskTitles: selected.map((item) => item.title), includeDueDates },
        });
        await updated.populate("preparationTasks.assignedTo", "name role status");
        return res.status(201).json({ tasks: updated.preparationTasks, addedCount: selected.length });
    } catch (error) {
        return res.status(500).json({ message: "Failed to add starter checklist" });
    }
};

module.exports = { getPreparationStarter, applyPreparationStarter };
