const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const Admin = require("../models/Admin");
const { PERMISSIONS, resolveAdminPermissions } = require("../config/permissions");
const { createActivityLog } = require("../utils/createActivityLog");

const validId = (value) => mongoose.Types.ObjectId.isValid(value);
const ACTIVE_BOOKING_STATUSES = ["Pending", "Confirmed", "In Progress"];

const parseDueDate = (value) => {
    if (value === null || value === "") return { value: null };
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return { error: "Due date must be a calendar date in YYYY-MM-DD format" };
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
        return { error: "Due date must be a valid calendar date" };
    }
    return { value: date };
};

const parseTaskDetails = async (body = {}) => {
    const values = {};
    if (Object.hasOwn(body, "notes")) {
        if (typeof body.notes !== "string" || body.notes.trim().length > 500) {
            return { error: "Task note must be at most 500 characters" };
        }
        values.notes = body.notes.trim();
    }
    if (Object.hasOwn(body, "priority")) {
        if (typeof body.priority !== "string" || !["High", "Normal", "Low"].includes(body.priority)) {
            return { error: "Priority must be High, Normal, or Low" };
        }
        values.priority = body.priority;
    }
    if (Object.hasOwn(body, "dueDate")) {
        const parsed = parseDueDate(body.dueDate);
        if (parsed.error) return parsed;
        values.dueDate = parsed.value;
    }
    if (Object.hasOwn(body, "assignedTo")) {
        if (body.assignedTo === null || body.assignedTo === "") {
            values.assignedTo = null;
        } else {
            if (typeof body.assignedTo !== "string" || !validId(body.assignedTo)) {
                return { error: "Invalid assignee ID" };
            }
            const admin = await Admin.findById(body.assignedTo)
                .select("_id name role status customPermissions");
            if (!admin || admin.status !== "Active" ||
                !resolveAdminPermissions(admin).includes(PERMISSIONS.BOOKING_UPDATE)) {
                return { error: "Assignee must be an active admin who can update bookings" };
            }
            values.assignedTo = admin._id;
        }
    }
    return { values };
};

const getPreparationAssignees = async (req, res) => {
    try {
        const admins = await Admin.find({ status: "Active" })
            .select("_id name role customPermissions")
            .sort({ name: 1 })
            .lean();
        return res.status(200).json({
            admins: admins
                .filter((admin) => resolveAdminPermissions(admin).includes(PERMISSIONS.BOOKING_UPDATE))
                .map(({ _id, name, role }) => ({ _id, name, role })),
        });
    } catch (error) {
        return res.status(500).json({ message: "Failed to load preparation assignees" });
    }
};

const sendTasks = async (res, booking, status = 200) => {
    await booking.populate("preparationTasks.assignedTo", "name role status");
    return res.status(status).json({ tasks: booking.preparationTasks });
};

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
        const { values, error } = await parseTaskDetails(req.body);
        if (error) return res.status(400).json({ message: error });

        const booking = await Booking.findOneAndUpdate(
            { _id: req.params.id, "preparationTasks.29": { $exists: false } },
            { $push: { preparationTasks: { title, ...values } } },
            { new: true, runValidators: true }
        );

        if (!booking) {
            const exists = await Booking.exists({ _id: req.params.id });
            return res.status(exists ? 409 : 404).json({
                message: exists ? "A booking can have at most 30 preparation tasks" : "Booking not found",
            });
        }

        await logChange(req, booking, `Preparation task added to booking ${booking.bookingCode}`, {
            taskTitle: title, assignedTo: values.assignedTo || null, dueDate: values.dueDate || null,
            priority: values.priority || "Normal", hasNotes: Boolean(values.notes),
        });
        return sendTasks(res, booking, 201);
    } catch (error) {
        return res.status(500).json({ message: "Failed to add preparation task" });
    }
};

const updatePreparationTaskDetails = async (req, res) => {
    try {
        if (!validId(req.params.id) || !validId(req.params.taskId)) {
            return res.status(400).json({ message: "Invalid booking or task ID" });
        }
        if (!req.body || (!Object.hasOwn(req.body, "assignedTo") && !Object.hasOwn(req.body, "dueDate") && !Object.hasOwn(req.body, "priority") && !Object.hasOwn(req.body, "notes"))) {
            return res.status(400).json({ message: "Provide an assignee, due date, priority, or note to update" });
        }
        const { values, error } = await parseTaskDetails(req.body);
        if (error) return res.status(400).json({ message: error });

        const booking = await Booking.findOneAndUpdate(
            { _id: req.params.id, "preparationTasks._id": req.params.taskId },
            { $set: Object.fromEntries(Object.entries(values).map(([key, value]) => [`preparationTasks.$.${key}`, value])) },
            { new: true, runValidators: true }
        );
        if (!booking) return res.status(404).json({ message: "Booking task not found" });

        const task = booking.preparationTasks.id(req.params.taskId);
        await logChange(req, booking, `Preparation task details updated for booking ${booking.bookingCode}`, {
            taskId: req.params.taskId, taskTitle: task?.title, updatedFields: Object.keys(values),
        });
        return sendTasks(res, booking);
    } catch (error) {
        return res.status(500).json({ message: "Failed to update preparation task details" });
    }
};

const claimPreparationTask = async (req, res) => {
    try {
        if (!validId(req.params.id) || !validId(req.params.taskId)) {
            return res.status(400).json({ message: "Invalid booking or task ID" });
        }

        const booking = await Booking.findOneAndUpdate(
            {
                _id: req.params.id,
                bookingStatus: { $in: ACTIVE_BOOKING_STATUSES },
                preparationTasks: { $elemMatch: {
                    _id: req.params.taskId, assignedTo: null, completedAt: null,
                } },
            },
            { $set: { "preparationTasks.$.assignedTo": req.admin._id } },
            { new: true, runValidators: true }
        );

        if (!booking) {
            const exists = await Booking.exists({ _id: req.params.id, "preparationTasks._id": req.params.taskId });
            return res.status(exists ? 409 : 404).json({
                message: exists ? "Task is no longer available to claim" : "Booking task not found",
            });
        }

        const task = booking.preparationTasks.id(req.params.taskId);
        await logChange(req, booking, `Preparation task claimed for booking ${booking.bookingCode}`, {
            taskId: req.params.taskId, taskTitle: task?.title, assignedTo: req.admin._id,
        });
        return sendTasks(res, booking);
    } catch (error) {
        return res.status(500).json({ message: "Failed to claim preparation task" });
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
        return sendTasks(res, booking);
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
        return sendTasks(res, booking);
    } catch (error) {
        return res.status(500).json({ message: "Failed to remove preparation task" });
    }
};

module.exports = { getPreparationAssignees, addPreparationTask, updatePreparationTaskDetails, claimPreparationTask, setPreparationTaskCompletion, deletePreparationTask };
