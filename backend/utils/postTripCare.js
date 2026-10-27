const { getBusinessDayBounds } = require("./businessDate");

const DAY_MS = 86400000;
const PAGE_SIZE = 20;
const FILTERS = ["due", "closeout", "waiting", "done", "all"];
const CHANNELS = ["WhatsApp", "Email", "Phone", "Other"];

const getPostTripQuery = (filter = "due", now = new Date()) => {
    const { start } = getBusinessDayBounds(now);
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

const endedBeforeToday = (booking, now = new Date()) => {
    const { start } = getBusinessDayBounds(now);
    const end = new Date(booking.travelEndDate);
    return Number.isFinite(end.getTime()) && end < start;
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
        updatedAt: now, updatedByName: adminName || "",
    };
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
        return { value: { ...base, status: "Feedback received", feedbackAt: now,
            feedbackRating: rating ?? null, feedbackNote: cleanNote } };
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
    revision: booking.postTripCareRevision ?? 0,
});

module.exports = { PAGE_SIZE, FILTERS, getPostTripQuery, endedBeforeToday, parseCareAction, summarizeCare };
