const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const BookingHandoverRead = require("../models/BookingHandoverRead");
const { createActivityLog } = require("../utils/createActivityLog");

const PAGE_SIZE = 20;
const noteSummary = (note) => ({ id: note._id, text: note.text,
    createdAt: note.createdAt, createdByName: note.createdByName || "Staff" });

const getHandoverWorklist = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    const filter = req.query.filter || "active";
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000 || !["active", "all", "unread"].includes(filter)) {
        return res.status(400).json({ message: "Invalid handover page or filter" });
    }
    const match = { "handoverNotes.0": { $exists: true } };
    if (filter !== "all") match.bookingStatus = { $in: ["Pending", "Confirmed", "In Progress"] };
    try {
        const pipeline = [
            { $match: match },
            { $project: { bookingCode: 1, bookingStatus: 1, travelStartDate: 1,
                noteCount: { $size: "$handoverNotes" }, lastNote: { $arrayElemAt: ["$handoverNotes", -1] } } },
            { $lookup: { from: BookingHandoverRead.collection.name, let: { bookingId: "$_id" },
                pipeline: [{ $match: { $expr: { $and: [
                    { $eq: ["$booking", "$$bookingId"] },
                    { $eq: ["$admin", new mongoose.Types.ObjectId(req.admin._id)] },
                ] } } }, { $project: { _id: 0, seenCount: 1 } }], as: "readState" } },
            { $addFields: { unreadCount: { $max: [0, { $subtract: ["$noteCount",
                { $ifNull: [{ $arrayElemAt: ["$readState.seenCount", 0] }, 0] }] }] } } },
        ];
        if (filter === "unread") pipeline.push({ $match: { unreadCount: { $gt: 0 } } });
        pipeline.push(
            { $sort: { "lastNote.createdAt": -1, _id: -1 } },
            { $facet: {
                items: [{ $skip: (page - 1) * PAGE_SIZE }, { $limit: PAGE_SIZE },
                    { $project: { _id: 0, bookingId: "$_id", bookingCode: 1, bookingStatus: 1,
                        travelStartDate: 1, noteCount: 1, unreadCount: 1, lastNoteAt: "$lastNote.createdAt",
                        lastAuthor: "$lastNote.createdByName" } }],
                total: [{ $count: "value" }],
            } },
        );
        const [result] = await Booking.aggregate(pipeline);
        const total = result?.total?.[0]?.value || 0;
        return res.json({ items: (result?.items || []).map((item) => ({
            bookingId: item.bookingId, bookingCode: item.bookingCode,
            bookingStatus: item.bookingStatus, travelStartDate: item.travelStartDate,
            noteCount: item.noteCount, unreadCount: item.unreadCount, lastNoteAt: item.lastNoteAt,
            lastAuthor: item.lastAuthor || "Staff",
        })), total, page, filter, totalPages: Math.ceil(total / PAGE_SIZE) || 1 });
    } catch (error) {
        console.error("Booking handover worklist failed:", error.message);
        return res.status(500).json({ message: "Failed to load handover worklist" });
    }
};

const markHandoverSeen = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid booking ID" });
    if (typeof req.body?.latestNoteId !== "string" || !/^[0-9a-fA-F]{24}$/.test(req.body.latestNoteId)) {
        return res.status(400).json({ message: "Choose a valid handover note to mark as read" });
    }
    try {
        const booking = await Booking.findById(req.params.id).select("_id +handoverNotes");
        if (!booking) return res.status(404).json({ message: "Booking not found" });
        const index = (booking.handoverNotes || []).findIndex((note) => String(note._id) === req.body.latestNoteId.toLowerCase());
        if (index < 0) return res.status(409).json({ message: "That handover note is no longer available. Refresh the notes." });
        const query = { booking: booking._id, admin: req.admin._id };
        const update = { $max: { seenCount: index + 1 } };
        try {
            await BookingHandoverRead.updateOne(query, update, { upsert: true, runValidators: true });
        } catch (error) {
            if (error.code !== 11000) throw error;
            // Another read acknowledgement created the row first. Keep the greater count.
            await BookingHandoverRead.updateOne(query, update, { runValidators: true });
        }
        return res.json({ reviewedThrough: req.body.latestNoteId.toLowerCase() });
    } catch (error) {
        console.error("Booking handover read state failed:", error.message);
        return res.status(500).json({ message: "Failed to mark handover notes as read" });
    }
};

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

module.exports = { getHandoverWorklist, getHandoverNotes, addHandoverNote, markHandoverSeen };
