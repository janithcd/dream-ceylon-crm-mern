const { getBusinessDayBounds } = require("./businessDate");
const { parseCalendarDate } = require("./paymentDueDate");

const DAY_MS = 86400000;
const PAGE_SIZE = 20;
const FILTERS = ["due", "closeout", "waiting", "done", "all", "recovery", "recovery-closed"];
const CHANNELS = ["WhatsApp", "Email", "Phone", "Other"];

const getPostTripQuery = (filter = "due", now = new Date()) => {
    const { start } = getBusinessDayBounds(now);
    if (filter === "recovery" || filter === "recovery-closed") return {
        bookingStatus: "Completed", travelEndDate: { $lt: start },
        "postTripCare.status": "Feedback received", "postTripCare.feedbackRating": { $gte: 1, $lte: 3 },
        "postTripCare.recovery.status": filter === "recovery" ? { $ne: "Resolved" } : "Resolved",
    };
    const base = {
        travelEndDate: { $gte: new Date(start.getTime() - 90 * DAY_MS), $lt: start },
        bookingStatus: { $in: ["Confirmed", "In Progress", "Completed"] },
    };
    if (filter === "closeout") return { ...base, bookingStatus: { $in: ["Confirmed", "In Progress"] } };
    if (filter === "due") return { ...base, bookingStatus: "Completed",
        "postTripCare.status": { $nin: ["Contacted", "Feedback received", "Declined"] } };
    if (filter === "waiting") return { ...base, bookingStatus: "Completed", "postTripCare.status": "Contacted" };
    if (filter === "done") return { ...base, bookingStatus: "Completed", "postTripCare.status": { $in: ["Feedback received", "Declined"] } };
    return base;
};

// Return only booking identifiers, codes and follow-up timing; recovery notes remain in the detail endpoint.
const buildRecoveryAlertsPipeline = (now = new Date()) => {
    const { start, end } = getBusinessDayBounds(now);
    return [
        { $match: { ...getPostTripQuery("recovery", now), $or: [
            { "postTripCare.recovery.nextFollowUpDate": null },
            { "postTripCare.recovery.nextFollowUpDate": { $lte: end } },
        ] } },
        { $project: { bookingCode: 1, followUpDate: { $ifNull: ["$postTripCare.recovery.nextFollowUpDate", null] } } },
        { $addFields: {
            overdue: { $and: [{ $ne: ["$followUpDate", null] }, { $lt: ["$followUpDate", start] }] },
            dueToday: { $and: [{ $gte: ["$followUpDate", start] }, { $lte: ["$followUpDate", end] }] },
            unscheduled: { $eq: ["$followUpDate", null] },
        } },
        { $facet: {
            summary: [{ $group: { _id: null, count: { $sum: 1 },
                overdue: { $sum: { $cond: ["$overdue", 1, 0] } },
                dueToday: { $sum: { $cond: ["$dueToday", 1, 0] } },
                unscheduled: { $sum: { $cond: ["$unscheduled", 1, 0] } },
            } }],
            items: [{ $sort: { overdue: -1, dueToday: -1, unscheduled: -1, followUpDate: 1, bookingCode: 1 } },
                { $limit: 5 }, { $project: { _id: 0, bookingId: "$_id", bookingCode: 1,
                    followUpDate: 1, overdue: 1, dueToday: 1, unscheduled: 1 } }],
        } },
    ];
};

// Completed trips in the 90-day care window that have not had their first recorded contact.
const buildContactAlertsPipeline = (now = new Date()) => [
    { $match: getPostTripQuery("due", now) },
    { $project: { bookingCode: 1, travelEndDate: 1 } },
    { $facet: {
        summary: [{ $count: "count" }],
        items: [{ $sort: { travelEndDate: 1, _id: 1 } }, { $limit: 5 },
            { $project: { _id: 0, bookingId: "$_id", bookingCode: 1, travelEndDate: 1 } }],
    } },
];

const endedBeforeToday = (booking, now = new Date()) => {
    const { start } = getBusinessDayBounds(now);
    const end = new Date(booking.travelEndDate);
    return Number.isFinite(end.getTime()) && end < start;
};

const isLowRating = (care) => care?.status === "Feedback received" &&
    Number.isInteger(care.feedbackRating) && care.feedbackRating >= 1 && care.feedbackRating <= 3;

const parseRecoveryAction = (body, current, adminName, now) => {
    const recovery = current.recovery || { status: "Open", events: [], nextFollowUpDate: null, resolvedAt: null };
    const action = body.action.slice("recovery-".length);
    if (!["plan", "contact", "resolve", "reopen"].includes(action)) return { error: "Choose a valid recovery action." };
    if (action === "reopen" ? recovery.status !== "Resolved" : recovery.status === "Resolved") {
        return { error: "Recovery status changed. Refresh the record before saving." };
    }
    const note = body.note.trim();
    if (note.length < (action === "resolve" ? 10 : 5)) {
        return { error: action === "resolve" ? "Describe the resolution in at least 10 characters." : "Describe the follow-up in at least 5 characters." };
    }
    if (action === "contact" && !CHANNELS.includes(body.channel)) return { error: "Choose how the guest was contacted." };
    if (action !== "contact" && body.channel !== undefined) return { error: "Contact channel applies only to actual contact." };
    if (!Object.hasOwn(body, "nextFollowUpDate")) return { error: "Choose a next follow-up date or explicitly clear it." };
    const parsed = parseCalendarDate(body.nextFollowUpDate, "Recovery follow-up date");
    if (parsed.error) return parsed;
    if (action === "plan" && !parsed.value) return { error: "Choose a follow-up date for the plan." };
    if (action === "resolve" && parsed.value) return { error: "A resolved recovery cannot have a follow-up date." };
    if (parsed.value) {
        const today = getBusinessDayBounds(now).start;
        const followUpDay = getBusinessDayBounds(parsed.value).start;
        if (followUpDay < today || followUpDay > new Date(today.getTime() + 90 * DAY_MS)) {
            return { error: "Recovery follow-up must be today or within the next 90 Sri Lanka calendar days." };
        }
    }
    const event = { action, at: now, byName: adminName || "", channel: action === "contact" ? body.channel : null,
        note, nextFollowUpDate: parsed.value };
    const events = [...(recovery.events || []).slice(-29), event];
    return { value: { ...current,
        ...(action === "contact" ? { contactCount: (current.contactCount || 0) + 1,
            lastContactedAt: now, lastContactChannel: body.channel, contactNote: note } : {}),
        recovery: { status: action === "resolve" ? "Resolved" : "Open",
        nextFollowUpDate: action === "resolve" ? null : parsed.value, resolvedAt: action === "resolve" ? now : null,
        events }, updatedAt: now, updatedByName: adminName || "" } };
};

const parseCareAction = (body, current, adminName, now = new Date()) => {
    const { action, expectedRevision, channel, note, rating } = body || {};
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
        return { error: "Refresh the post-trip record before saving." };
    }
    if (typeof note !== "string" || note.trim().length > 500 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(note)) {
        return { error: "Enter a note of at most 500 characters (or leave it blank)." };
    }
    const cleanNote = note.trim();
    const previous = current || {};
    const base = {
        status: previous.status, contactCount: previous.contactCount || 0,
        lastContactedAt: previous.lastContactedAt || null,
        lastContactChannel: previous.lastContactChannel || null,
        contactNote: previous.contactNote || "",
        feedbackAt: previous.feedbackAt || null,
        feedbackRating: previous.feedbackRating ?? null,
        feedbackNote: previous.feedbackNote || "",
        recovery: previous.recovery || null,
        updatedAt: now, updatedByName: adminName || "",
    };
    if (typeof action === "string" && action.startsWith("recovery-")) {
        if (!isLowRating(previous)) return { error: "Recovery is available only for feedback rated 1 to 3." };
        return parseRecoveryAction(body, base, adminName, now);
    }
    if (action === "contacted") {
        if (!["Contacted", undefined].includes(previous.status)) return { error: "Feedback is already closed for this trip." };
        if (!CHANNELS.includes(channel)) return { error: "Choose how the guest was contacted." };
        return { value: { ...base, status: "Contacted", contactCount: base.contactCount + 1,
            lastContactedAt: now, lastContactChannel: channel, contactNote: cleanNote } };
    }
    if (action === "feedback") {
        if (previous.status === "Declined") return { error: "The guest declined follow-up. Do not record a new request without reviewing the booking." };
        if (rating !== null && rating !== undefined && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
            return { error: "Choose a rating from 1 to 5 or leave it blank." };
        }
        if (!cleanNote && rating == null) return { error: "Record a rating or a short feedback note." };
        if (previous.recovery?.events?.length && rating !== previous.feedbackRating) {
            return { error: "Recovery actions are recorded for this rating. Keep the rating and add a recovery note instead." };
        }
        return { value: { ...base, status: "Feedback received", feedbackAt: now,
            feedbackRating: rating ?? null, feedbackNote: cleanNote,
            recovery: rating >= 1 && rating <= 3 ? (base.recovery || { status: "Open", nextFollowUpDate: null, resolvedAt: null, events: [] }) : null } };
    }
    if (action === "declined") {
        if (previous.status === "Feedback received" || previous.status === "Declined") {
            return { error: "The post-trip outcome is already closed." };
        }
        return { value: { ...base, status: "Declined", feedbackAt: now,
            feedbackRating: null, feedbackNote: cleanNote } };
    }
    return { error: "Choose a valid post-trip action." };
};

const summarizeCare = (booking) => ({
    _id: booking._id, bookingCode: booking.bookingCode,
    customerName: booking.customer?.fullName || "", travelEndDate: booking.travelEndDate,
    bookingStatus: booking.bookingStatus, status: booking.postTripCare?.status || "Not contacted",
    contactCount: booking.postTripCare?.contactCount || 0,
    lastContactedAt: booking.postTripCare?.lastContactedAt || null,
    lastContactChannel: booking.postTripCare?.lastContactChannel || null,
    feedbackRating: booking.postTripCare?.feedbackRating ?? null,
    feedbackAt: booking.postTripCare?.feedbackAt || null,
    recoveryStatus: isLowRating(booking.postTripCare) ? booking.postTripCare?.recovery?.status || "Open" : null,
    recoveryFollowUpDate: booking.postTripCare?.recovery?.nextFollowUpDate || null,
    revision: booking.postTripCareRevision ?? 0,
});

module.exports = { PAGE_SIZE, FILTERS, getPostTripQuery, buildRecoveryAlertsPipeline, buildContactAlertsPipeline,
    endedBeforeToday, isLowRating, parseCareAction, summarizeCare };
