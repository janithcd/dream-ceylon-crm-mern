const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const { createActivityLog } = require("../utils/createActivityLog");

const PAGE_SIZE = 20;
const noteSummary = (note) => ({ id: note._id, text: note.text,
    createdAt: note.createdAt, createdByName: note.createdByName || "Staff" });

const getHandoverNotes = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid booking ID" });
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000) {
        return res.status(400).json({ message: "Invalid handover page" });
    }
    try {
        const booking = await Booking.findById(req.params.id).select("bookingCode +handoverNotes");
        if (!booking) return res.status(404).json({ message: "Booking not found" });
        const notes = booking.handoverNotes || [];
        const end = Math.max(0, notes.length - (page - 1) * PAGE_SIZE);
        const start = Math.max(0, end - PAGE_SIZE);
        return res.json({ notes: notes.slice(start, end).reverse().map(noteSummary),
            page, total: notes.length, totalPages: Math.ceil(notes.length / PAGE_SIZE) || 1 });
    } catch (error) {
        console.error("Booking handover load failed:", error.message);
        return res.status(500).json({ message: "Failed to load handover notes" });
    }
};

const addHandoverNote = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid booking ID" });
    if (typeof req.body?.text !== "string" || !req.body.text.trim() || req.body.text.trim().length > 1000) {
        return res.status(400).json({ message: "Write a note of 1 to 1000 characters" });
    }
    const note = { _id: new mongoose.Types.ObjectId(), text: req.body.text.trim(),
        createdAt: new Date(), createdBy: req.admin._id, createdByName: (req.admin.name || "").slice(0, 120) };
    try {
        const booking = await Booking.findOneAndUpdate({ _id: req.params.id, "handoverNotes.199": { $exists: false } },
            { $push: { handoverNotes: note } }, { returnDocument: "after", runValidators: true });
        if (!booking) {
            const exists = await Booking.exists({ _id: req.params.id });
            return res.status(exists ? 409 : 404).json({ message: exists
                ? "This booking has reached the 200-note handover limit" : "Booking not found" });
        }
        await createActivityLog({ req, action: "UPDATE", module: "Booking",
            description: `Internal handover note added to booking ${booking.bookingCode}`,
            relatedRecordId: booking._id, relatedModel: "Booking", referenceNo: booking.bookingCode,
            customerName: booking.customer?.fullName,
        });
        return res.status(201).json({ note: noteSummary(note) });
    } catch (error) {
        if (error.name === "ValidationError") return res.status(400).json({ message: "Invalid handover note" });
        console.error("Booking handover save failed:", error.message);
        return res.status(500).json({ message: "Failed to save handover note" });
    }
};

module.exports = { getHandoverNotes, addHandoverNote };
