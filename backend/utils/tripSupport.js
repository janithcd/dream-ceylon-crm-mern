const { getBusinessDayBounds } = require("./businessDate");
const { parseCalendarDate } = require("./paymentDueDate");

const DAY_MS = 86400000;
const PAGE_SIZE = 20;
const FILTERS = ["open", "active", "all"];
const CATEGORIES = ["Accommodation", "Transport", "Guide", "Itinerary", "Health & Safety", "Other"];
const PRIORITIES = ["Urgent", "Normal"];

const activeTripQuery = (now = new Date()) => {
    const { start, end } = getBusinessDayBounds(now);
    return { bookingStatus: { $in: ["Confirmed", "In Progress"] },
        travelStartDate: { $lte: end }, travelEndDate: { $gte: start } };
};
const buildTripSupportQuery = (filter = "open", now = new Date()) => {
    const active = activeTripQuery(now);
    const open = { "tripIssues.status": "Open" };
    if (filter === "active") return active;
    if (filter === "all") return { $or: [active, open] };
    return open;
};
const isActiveTrip = (booking, now = new Date()) => {
    const { start, end } = getBusinessDayBounds(now);
    const from = new Date(booking.travelStartDate);
    const to = new Date(booking.travelEndDate);
    return ["Confirmed", "In Progress"].includes(booking.bookingStatus) &&
        Number.isFinite(from.getTime()) && Number.isFinite(to.getTime()) && from <= end && to >= start;
};
const summarizeTripSupport = (booking, now = new Date()) => {
    const open = (booking.tripIssues || []).filter((issue) => issue.status === "Open");
    const { start, end } = getBusinessDayBounds(now);
    return { _id: booking._id, bookingCode: booking.bookingCode,
        customerName: booking.customer?.fullName || "", bookingStatus: booking.bookingStatus,
        travelStartDate: booking.travelStartDate, travelEndDate: booking.travelEndDate,
        activeToday: isActiveTrip(booking, now), openIssueCount: open.length,
        urgentIssueCount: open.filter((issue) => issue.priority === "Urgent").length,
        overdueIssueCount: open.filter((issue) => issue.nextFollowUpDate && new Date(issue.nextFollowUpDate) < start).length,
        dueTodayIssueCount: open.filter((issue) => issue.nextFollowUpDate &&
            new Date(issue.nextFollowUpDate) >= start && new Date(issue.nextFollowUpDate) <= end).length,
        unscheduledIssueCount: open.filter((issue) => !issue.nextFollowUpDate).length };
};
const cleanNote = (value, min = 5) => typeof value === "string" && value.trim().length >= min &&
    value.trim().length <= 500 && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(value)
    ? value.trim() : null;
const parseFollowUp = (body, now) => {
    if (!Object.hasOwn(body || {}, "nextFollowUpDate")) return { error: "Choose a next follow-up date or explicitly clear it." };
    const parsed = parseCalendarDate(body.nextFollowUpDate, "Trip issue follow-up date");
    if (parsed.error) return parsed;
    if (parsed.value) {
        const day = getBusinessDayBounds(parsed.value).start;
        const today = getBusinessDayBounds(now).start;
        if (day < today || day > new Date(today.getTime() + 90 * DAY_MS)) {
            return { error: "Follow-up must be today or within the next 90 Sri Lanka calendar days." };
        }
    }
    return parsed;
};

const parseNewIssue = (body, adminName, now = new Date()) => {
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    if (title.length < 5 || title.length > 120) return { error: "Issue title must be 5 to 120 characters." };
    if (!CATEGORIES.includes(body?.category)) return { error: "Choose an issue category." };
    if (!PRIORITIES.includes(body?.priority)) return { error: "Choose an issue priority." };
    const note = cleanNote(body?.note);
    if (!note) return { error: "Describe the issue in 5 to 500 characters." };
    const followUp = parseFollowUp(body, now);
    if (followUp.error) return followUp;
    return { value: { title, category: body.category, priority: body.priority, status: "Open",
        nextFollowUpDate: followUp.value, openedAt: now, resolvedAt: null, revision: 0,
        events: [{ action: "opened", note, at: now, byName: adminName || "", nextFollowUpDate: followUp.value }] } };
};

const parseIssueAction = (body, issue, adminName, now = new Date()) => {
    if (!Number.isSafeInteger(body?.expectedRevision) || body.expectedRevision < 0) {
        return { error: "Refresh the issue before saving." };
    }
    const action = body.action;
    if (!["updated", "resolved", "reopened"].includes(action)) return { error: "Choose a valid issue action." };
    if (issue.status === "Resolved" ? action !== "reopened" : action === "reopened") {
        return { error: "Issue status changed. Refresh before saving." };
    }
    const note = cleanNote(body.note, action === "resolved" ? 10 : 5);
    if (!note) return { error: action === "resolved" ? "Describe the resolution in 10 to 500 characters." : "Enter an update of 5 to 500 characters." };
    const followUp = parseFollowUp(body, now);
    if (followUp.error) return followUp;
    if (action === "resolved" && followUp.value) return { error: "A resolved issue cannot have a follow-up date." };
    const event = { action, note, at: now, byName: adminName || "", nextFollowUpDate: followUp.value };
    return { value: { status: action === "resolved" ? "Resolved" : "Open",
        resolvedAt: action === "resolved" ? now : null, nextFollowUpDate: followUp.value, event } };
};

module.exports = { PAGE_SIZE, FILTERS, activeTripQuery, buildTripSupportQuery, isActiveTrip,
    summarizeTripSupport, parseNewIssue, parseIssueAction };
