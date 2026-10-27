const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const { createActivityLog } = require("../utils/createActivityLog");
const { getDocumentBrandConfig } = require("../utils/documentSettings");
const { buildPostTripMessage } = require("../utils/postTripMessage");
const { PAGE_SIZE, FILTERS, getPostTripQuery, buildRecoveryAlertsPipeline, buildContactAlertsPipeline,
    buildFeedbackAlertsPipeline, lastCareDay, endedBeforeToday, isLowRating, parseCareAction, summarizeCare } = require("../utils/postTripCare");

const validId = (id) => mongoose.Types.ObjectId.isValid(id);
const revisionMatch = (revision) => revision === 0 ? { $in: [null, 0] } : revision;
const available = (booking) => {
    const { $gte } = getPostTripQuery("all").travelEndDate;
    return booking.bookingStatus === "Completed" && endedBeforeToday(booking) &&
        new Date(booking.travelEndDate) >= $gte;
};
const recoveryAvailable = (booking) => booking.bookingStatus === "Completed" && endedBeforeToday(booking) && isLowRating(booking.postTripCare);

const getPostTripCareQueue = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const filter = req.query.filter || "due";
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    if (!FILTERS.includes(filter) || !Number.isSafeInteger(page) || page < 1 || page > 1000) {
        return res.status(400).json({ message: "Choose a valid post-trip filter and page." });
    }
    try {
        const now = new Date();
        const query = getPostTripQuery(filter, now);
        const [bookings, total, closeout, due, waiting, feedbackDue, done, recovery] = await Promise.all([
            Booking.find(query)
                .select("bookingCode customer.fullName travelEndDate bookingStatus postTripCare.status postTripCare.contactCount postTripCare.lastContactedAt postTripCare.lastContactChannel postTripCare.nextFeedbackFollowUpDate postTripCare.feedbackRating postTripCare.feedbackAt postTripCare.recovery.status postTripCare.recovery.nextFollowUpDate postTripCareRevision")
                .sort(filter === "recovery" ? { "postTripCare.recovery.nextFollowUpDate": 1, travelEndDate: -1, _id: -1 }
                    : filter === "feedback-due" ? { "postTripCare.nextFeedbackFollowUpDate": 1, travelEndDate: -1, _id: -1 }
                        : { travelEndDate: -1, _id: -1 })
                .skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
            Booking.countDocuments(query),
            ...["closeout", "due", "waiting", "feedback-due", "done", "recovery"].map((key) => Booking.countDocuments(getPostTripQuery(key, now))),
        ]);
        return res.json({ items: bookings.map(summarizeCare), total, page, pages: Math.ceil(total / PAGE_SIZE) || 1,
            filter, summary: { closeout, due, waiting, feedbackDue, done, recovery } });
    } catch (error) {
        console.error("Post-trip care queue failed:", error.message);
        return res.status(500).json({ message: "Failed to load post-trip care." });
    }
};

const getRecoveryAlerts = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
        const [recovery, contact, feedback] = await Promise.all([
            Booking.aggregate(buildRecoveryAlertsPipeline()), Booking.aggregate(buildContactAlertsPipeline()),
            Booking.aggregate(buildFeedbackAlertsPipeline()),
        ]);
        return res.json({ summary: recovery[0]?.summary?.[0] || { count: 0, overdue: 0, dueToday: 0, unscheduled: 0 },
            items: recovery[0]?.items || [],
            contact: { count: contact[0]?.summary?.[0]?.count || 0, items: contact[0]?.items || [] },
            feedback: { count: feedback[0]?.summary?.[0]?.count || 0,
                overdue: feedback[0]?.summary?.[0]?.overdue || 0, items: feedback[0]?.items || [] } });
    } catch (error) {
        console.error("Guest care alerts failed:", error.message);
        return res.status(500).json({ message: "Failed to load guest care alerts." });
    }
};

const getPostTripCare = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid booking ID" });
    try {
        const booking = await Booking.findById(req.params.id).select("bookingCode customer.fullName bookingStatus travelEndDate postTripCare postTripCareRevision");
        if (!booking) return res.status(404).json({ message: "Booking not found" });
        if (!available(booking) && !recoveryAvailable(booking)) return res.status(409).json({ message: "This trip is outside the post-trip care window." });
        return res.json({ bookingCode: booking.bookingCode, customerName: booking.customer?.fullName || "",
            status: booking.postTripCare?.status || "Not contacted", careWindowOpen: available(booking),
            careUntil: lastCareDay(booking.travelEndDate),
            revision: booking.postTripCareRevision ?? 0,
            contactCount: booking.postTripCare?.contactCount || 0,
            lastContactedAt: booking.postTripCare?.lastContactedAt || null,
            lastContactChannel: booking.postTripCare?.lastContactChannel || null,
            nextFeedbackFollowUpDate: booking.postTripCare?.nextFeedbackFollowUpDate || null,
            contactNote: booking.postTripCare?.contactNote || "",
            feedbackAt: booking.postTripCare?.feedbackAt || null,
            feedbackRating: booking.postTripCare?.feedbackRating ?? null,
            feedbackNote: booking.postTripCare?.feedbackNote || "",
            updatedByName: booking.postTripCare?.updatedByName || "",
            recovery: isLowRating(booking.postTripCare) ? {
                status: booking.postTripCare?.recovery?.status || "Open",
                nextFollowUpDate: booking.postTripCare?.recovery?.nextFollowUpDate || null,
                resolvedAt: booking.postTripCare?.recovery?.resolvedAt || null,
                events: [...(booking.postTripCare?.recovery?.events || [])].reverse().map((event) => ({
                    action: event.action, at: event.at, byName: event.byName, channel: event.channel,
                    note: event.note, nextFollowUpDate: event.nextFollowUpDate,
                })),
            } : null });
    } catch (error) {
        return res.status(500).json({ message: "Failed to load post-trip record." });
    }
};

const getPostTripMessage = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid booking ID" });
    try {
        const booking = await Booking.findById(req.params.id)
            .select("bookingCode bookingStatus travelEndDate customer.fullName customer.whatsappNumber postTripCare.status");
        if (!booking) return res.status(404).json({ message: "Booking not found" });
        if (!available(booking) || ["Feedback received", "Declined"].includes(booking.postTripCare?.status)) {
            return res.status(409).json({ message: "Guest feedback requests are available only for completed trips still awaiting feedback." });
        }
        return res.json(buildPostTripMessage(booking, await getDocumentBrandConfig()));
    } catch (error) {
        return res.status(500).json({ message: "Failed to prepare guest message." });
    }
};

const recordPostTripCare = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid booking ID" });
    try {
        const current = await Booking.findById(req.params.id)
            .select("bookingCode bookingStatus travelEndDate customer.fullName postTripCare postTripCareRevision");
        if (!current) return res.status(404).json({ message: "Booking not found" });
        const isRecovery = typeof req.body?.action === "string" && req.body.action.startsWith("recovery-");
        if (isRecovery ? !recoveryAvailable(current) : !available(current)) {
            return res.status(409).json({ message: "This trip is outside the post-trip care window or recovery is unavailable." });
        }
        const parsed = parseCareAction(req.body, current.postTripCare, req.admin?.name, new Date(), current.travelEndDate);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const expected = req.body.expectedRevision;
        if ((current.postTripCareRevision ?? 0) !== expected) {
            return res.status(409).json({ message: "Post-trip care changed. Refresh and try again." });
        }
        const updated = await Booking.findOneAndUpdate({
            _id: current._id, bookingStatus: "Completed",
            travelEndDate: isRecovery ? { $lt: getPostTripQuery("recovery").travelEndDate.$lt, $eq: current.travelEndDate }
                : { ...getPostTripQuery("all").travelEndDate, $eq: current.travelEndDate },
            postTripCareRevision: revisionMatch(expected),
        }, { $set: { postTripCare: parsed.value }, $inc: { postTripCareRevision: 1 } },
        { returnDocument: "after", runValidators: true });
        if (!updated) return res.status(409).json({ message: "The trip or post-trip record changed. Refresh and try again." });
        const descriptions = { contacted: "Guest contact recorded", "schedule-feedback": "Guest feedback reminder updated", feedback: "Guest feedback recorded", declined: "Guest declined post-trip contact",
            "recovery-plan": "Guest recovery follow-up planned", "recovery-contact": "Guest recovery contact recorded",
            "recovery-resolve": "Guest recovery resolved", "recovery-reopen": "Guest recovery reopened" };
        await createActivityLog({ req, action: "UPDATE", module: "Booking",
            description: `${descriptions[req.body.action]} for booking ${updated.bookingCode}`,
            relatedRecordId: updated._id, relatedModel: "Booking", referenceNo: updated.bookingCode,
            customerName: updated.customer?.fullName,
            metadata: { status: parsed.value.status, channel: ["contacted", "recovery-contact"].includes(req.body.action) ? req.body.channel : undefined,
                recoveryStatus: isRecovery ? parsed.value.recovery.status : undefined },
        });
        return res.json({ care: summarizeCare(updated) });
    } catch (error) {
        if (error.name === "ValidationError") return res.status(400).json({ message: "Post-trip record is invalid." });
        return res.status(500).json({ message: "Failed to update post-trip record." });
    }
};

module.exports = { getPostTripCareQueue, getRecoveryAlerts, getPostTripCare, getPostTripMessage, recordPostTripCare };
