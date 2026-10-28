const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const Admin = require("../models/Admin");
const { PERMISSIONS, resolveAdminPermissions } = require("../config/permissions");
const { createActivityLog } = require("../utils/createActivityLog");
const { getDocumentBrandConfig } = require("../utils/documentSettings");
const { buildPostTripMessage } = require("../utils/postTripMessage");
const { PAGE_SIZE, FILTERS, OWNER_FILTERS, getCareOwnerQuery, getPostTripQuery, buildRecoveryAlertsPipeline, buildContactAlertsPipeline,
    buildFeedbackAlertsPipeline, lastCareDay, endedBeforeToday, isLowRating, parseCareAction, summarizeCare } = require("../utils/postTripCare");

const validId = (id) => mongoose.Types.ObjectId.isValid(id);
const revisionMatch = (revision) => revision === 0 ? { $in: [null, 0] } : revision;
const available = (booking) => {
    const { $gte } = getPostTripQuery("all").travelEndDate;
    return booking.bookingStatus === "Completed" && endedBeforeToday(booking) &&
        new Date(booking.travelEndDate) >= $gte;
};
const recoveryAvailable = (booking) => booking.bookingStatus === "Completed" && endedBeforeToday(booking) && isLowRating(booking.postTripCare);
const resolveOwner = async (value, req) => {
    if (value === null || value === "") return { owner: null, ownerName: "" };
    if (value === "__me__" || String(value) === String(req.admin._id)) {
        return { owner: req.admin._id, ownerName: (req.admin.name || "").slice(0, 120) };
    }
    if (typeof value !== "string" || !validId(value)) return { error: "Choose a valid guest care owner." };
    const admin = await Admin.findById(value).select("_id name role status customPermissions");
    if (!admin || admin.status !== "Active" || !resolveAdminPermissions(admin).includes(PERMISSIONS.BOOKING_UPDATE)) {
        return { error: "Guest care owner must be active staff with booking edit access." };
    }
    return { owner: admin._id, ownerName: admin.name.slice(0, 120) };
};

const getPostTripCareQueue = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const filter = req.query.filter || "due";
    const owner = req.query.owner || "all";
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    if (!FILTERS.includes(filter) || !OWNER_FILTERS.includes(owner) || !Number.isSafeInteger(page) || page < 1 || page > 1000) {
        return res.status(400).json({ message: "Choose a valid post-trip filter and page." });
    }
    try {
        const now = new Date();
        const ownerQuery = getCareOwnerQuery(owner, req.admin._id);
        const query = { ...getPostTripQuery(filter, now), ...ownerQuery };
        const [bookings, total, closeout, due, waiting, feedbackDue, done, recovery] = await Promise.all([
            Booking.find(query)
                .select("bookingCode customer.fullName travelEndDate bookingStatus postTripCareOwner postTripCareOwnerName postTripCare.status postTripCare.contactCount postTripCare.lastContactedAt postTripCare.lastContactChannel postTripCare.nextFeedbackFollowUpDate postTripCare.feedbackRating postTripCare.feedbackAt postTripCare.recovery.status postTripCare.recovery.nextFollowUpDate postTripCareRevision")
                .sort(filter === "recovery" ? { "postTripCare.recovery.nextFollowUpDate": 1, travelEndDate: -1, _id: -1 }
                    : filter === "feedback-due" ? { "postTripCare.nextFeedbackFollowUpDate": 1, travelEndDate: -1, _id: -1 }
                        : { travelEndDate: -1, _id: -1 })
                .skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
            Booking.countDocuments(query),
            ...["closeout", "due", "waiting", "feedback-due", "done", "recovery"].map((key) =>
                Booking.countDocuments({ ...getPostTripQuery(key, now), ...ownerQuery })),
        ]);
        return res.json({ items: bookings.map(summarizeCare), total, page, pages: Math.ceil(total / PAGE_SIZE) || 1,
            filter, owner, summary: { closeout, due, waiting, feedbackDue, done, recovery } });
    } catch (error) {
        console.error("Post-trip care queue failed:", error.message);
        return res.status(500).json({ message: "Failed to load post-trip care." });
    }
};

const getRecoveryAlerts = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
        const now = new Date();
        const [recovery, contact, feedback] = await Promise.all([
            Booking.aggregate(buildRecoveryAlertsPipeline(now, req.admin._id)),
            Booking.aggregate(buildContactAlertsPipeline(now, req.admin._id)),
            Booking.aggregate(buildFeedbackAlertsPipeline(now, req.admin._id)),
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
        const booking = await Booking.findById(req.params.id).select("bookingCode customer.fullName bookingStatus travelEndDate postTripCare postTripCareOwner postTripCareOwnerName postTripCareRevision");
        if (!booking) return res.status(404).json({ message: "Booking not found" });
        if (!available(booking) && !recoveryAvailable(booking)) return res.status(409).json({ message: "This trip is outside the post-trip care window." });
        return res.json({ bookingCode: booking.bookingCode, customerName: booking.customer?.fullName || "",
            status: booking.postTripCare?.status || "Not contacted", careWindowOpen: available(booking),
            owner: booking.postTripCareOwner || null, ownerName: booking.postTripCareOwnerName || "",
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
            events: [...(booking.postTripCare?.events || [])].reverse().map((event) => ({
                action: event.action, at: event.at, byName: event.byName, channel: event.channel,
                note: event.note, nextFeedbackFollowUpDate: event.nextFeedbackFollowUpDate,
                rating: event.rating,
            })),
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

const assignPostTripCare = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid booking ID" });
    if (!Number.isSafeInteger(req.body?.expectedRevision) || req.body.expectedRevision < 0 ||
        !Object.hasOwn(req.body, "assignedTo")) return res.status(400).json({ message: "Refresh care and choose an owner or unassigned." });
    try {
        const current = await Booking.findById(req.params.id)
            .select("bookingCode customer.fullName bookingStatus travelEndDate postTripCare.status postTripCare.feedbackRating postTripCare.recovery.status postTripCareOwner postTripCareOwnerName postTripCareRevision");
        if (!current) return res.status(404).json({ message: "Booking not found" });
        const withinWindow = available(current);
        if (!withinWindow && !(recoveryAvailable(current) && current.postTripCare?.recovery?.status !== "Resolved")) {
            return res.status(409).json({ message: "Only open guest care or recovery work can change owner." });
        }
        if ((current.postTripCareRevision ?? 0) !== req.body.expectedRevision) {
            return res.status(409).json({ message: "Guest care changed. Refresh and try again." });
        }
        const resolved = await resolveOwner(req.body.assignedTo, req);
        if (resolved.error) return res.status(400).json({ message: resolved.error });
        if (String(current.postTripCareOwner || "") === String(resolved.owner || "")) {
            return res.status(400).json({ message: "Choose a different owner to record a change." });
        }
        const updated = await Booking.findOneAndUpdate({ _id: current._id, bookingStatus: "Completed",
            travelEndDate: withinWindow ? { ...getPostTripQuery("all").travelEndDate, $eq: current.travelEndDate }
                : { $lt: getPostTripQuery("recovery").travelEndDate.$lt, $eq: current.travelEndDate },
            postTripCareRevision: revisionMatch(req.body.expectedRevision),
        }, { $set: { postTripCareOwner: resolved.owner, postTripCareOwnerName: resolved.ownerName },
            $inc: { postTripCareRevision: 1 } }, { returnDocument: "after", runValidators: true });
        if (!updated) return res.status(409).json({ message: "The booking or guest care changed. Refresh and try again." });
        await createActivityLog({ req, action: "UPDATE", module: "Booking",
            description: `Guest care owner changed for booking ${updated.bookingCode}`,
            relatedRecordId: updated._id, relatedModel: "Booking", referenceNo: updated.bookingCode,
            customerName: updated.customer?.fullName,
            metadata: { assignedTo: resolved.owner, assignedToName: resolved.ownerName },
        });
        return res.json({ owner: updated.postTripCareOwner || null, ownerName: updated.postTripCareOwnerName || "",
            revision: updated.postTripCareRevision });
    } catch (error) {
        if (error.name === "ValidationError") return res.status(400).json({ message: "Guest care owner is invalid." });
        console.error("Assign guest care failed:", error.message);
        return res.status(500).json({ message: "Failed to assign guest care." });
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

module.exports = { getPostTripCareQueue, getRecoveryAlerts, getPostTripCare, getPostTripMessage, recordPostTripCare,
    assignPostTripCare };
