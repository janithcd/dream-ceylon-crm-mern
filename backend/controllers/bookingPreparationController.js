const mongoose = require("mongoose");
const Booking = require("../models/Booking");
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

const addPreparationTask = async (req, res) => {
    try {
        if (!validId(req.params.id)) {
            return res.status(400).json({ message: "Invalid booking ID" });
        }

        const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
        if (!title || title.length > 120) {
            return res.status(400).json({ message: "Task title must be 1 to 120 characters" });
        }

        const booking = await Booking.findOneAndUpdate(
            { _id: req.params.id, "preparationTasks.29": { $exists: false } },
            { $push: { preparationTasks: { title } } },
            { new: true, runValidators: true }
        );

        if (!booking) {
            const exists = await Booking.exists({ _id: req.params.id });
            return res.status(exists ? 409 : 404).json({
                message: exists ? "A booking can have at most 30 preparation tasks" : "Booking not found",
            });
        }

        await logChange(req, booking, `Preparation task added to booking ${booking.bookingCode}`, { taskTitle: title });
        return res.status(201).json({ tasks: booking.preparationTasks });
    } catch (error) {
        return res.status(500).json({ message: "Failed to add preparation task" });
    }
};

const setPreparationTaskCompletion = async (req, res) => {
    try {
        if (!validId(req.params.id) || !validId(req.params.taskId)) {
            return res.status(400).json({ message: "Invalid booking or task ID" });
        }
        if (typeof req.body?.completed !== "boolean") {
            return res.status(400).json({ message: "Completed must be true or false" });
        }

        const booking = await Booking.findOneAndUpdate(
            { _id: req.params.id, "preparationTasks._id": req.params.taskId },
            {
                $set: {
                    "preparationTasks.$.completedAt": req.body.completed ? new Date() : null,
                    "preparationTasks.$.completedBy": req.body.completed ? req.admin._id : null,
                },
            },
            { new: true, runValidators: true }
        );

        if (!booking) {
            return res.status(404).json({ message: "Booking task not found" });
        }

        const task = booking.preparationTasks.id(req.params.taskId);
        await logChange(req, booking, `Preparation task ${req.body.completed ? "completed" : "reopened"} for booking ${booking.bookingCode}`, {
            taskId: req.params.taskId,
            taskTitle: task?.title,
        });
        return res.status(200).json({ tasks: booking.preparationTasks });
    } catch (error) {
        return res.status(500).json({ message: "Failed to update preparation task" });
    }
};

const deletePreparationTask = async (req, res) => {
    try {
        if (!validId(req.params.id) || !validId(req.params.taskId)) {
            return res.status(400).json({ message: "Invalid booking or task ID" });
        }

        const booking = await Booking.findOneAndUpdate(
            { _id: req.params.id, "preparationTasks._id": req.params.taskId },
            { $pull: { preparationTasks: { _id: req.params.taskId } } },
            { new: true }
        );

        if (!booking) {
            return res.status(404).json({ message: "Booking task not found" });
        }

        await logChange(req, booking, `Preparation task removed from booking ${booking.bookingCode}`, { taskId: req.params.taskId });
        return res.status(200).json({ tasks: booking.preparationTasks });
    } catch (error) {
        return res.status(500).json({ message: "Failed to remove preparation task" });
    }
};

module.exports = { addPreparationTask, setPreparationTaskCompletion, deletePreparationTask };
