const { parseCalendarDate } = require("./paymentDueDate");
const { getBusinessDayBounds } = require("./businessDate");
const { formatDocumentDate } = require("./documentDate");

const TYPES = ["Safari", "Whale watching", "Train", "Cooking class", "Guide", "Other"];
const STATUSES = ["Planned", "Requested", "Confirmed", "Completed", "Cancellation requested", "Cancelled"];
const TRANSITIONS = {
    Planned: ["Requested", "Cancelled"], Requested: ["Confirmed", "Cancellation requested"],
    Confirmed: ["Completed", "Cancellation requested"], "Cancellation requested": ["Cancelled"],
    Cancelled: ["Planned"], Completed: [],
};
const FIELDS = { title: 120, supplierName: 160, supplierEmail: 254, supplierPhone: 30,
    meetingPoint: 200, guestInstructions: 500, internalNotes: 500 };
const clean = (text, max) => typeof text === "string" && text.trim().length <= max &&
    !/[\p{Cc}\u2028\u2029\u202a-\u202e\u2066-\u2069]/u.test(text);
const day = (date) => date && !Number.isNaN(new Date(date).getTime()) ? new Date(date).toISOString().slice(0, 10) : "";
const today = (now = new Date()) => getBusinessDayBounds(now).end.toISOString().slice(0, 10);
const excursionsFitBooking = (items, booking) => (items || []).every((item) => item.status === "Cancelled" ||
    (day(booking.travelStartDate) && day(booking.travelEndDate) && day(item.date) && day(item.date) >= day(booking.travelStartDate) &&
        day(item.date) <= day(booking.travelEndDate) && item.participants <= booking.numberOfTravelers));

const parseExcursion = (body, booking) => {
    const value = {};
    for (const [field, max] of Object.entries(FIELDS)) {
        const raw = body?.[field] ?? "";
        if (!clean(raw, max)) return { error: `${field} must be a single line of at most ${max} characters.` };
        value[field] = raw.trim();
    }
    if (!value.title) return { error: "Enter the activity name." };
    if (!TYPES.includes(body?.type)) return { error: "Choose an activity type." };
    value.type = body.type;
    if (value.supplierEmail && !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value.supplierEmail)) return { error: "Enter one valid supplier email." };
    if (value.supplierPhone && !/^\+?[\d ()-]{6,30}$/.test(value.supplierPhone)) return { error: "Enter a valid supplier phone." };
    value.supplierEmail = value.supplierEmail.toLowerCase();
    const date = parseCalendarDate(body.date, "Activity date");
    const followUp = parseCalendarDate(body.followUpDate ?? "", "Follow-up date");
    if (date.error || !date.value || followUp.error || (followUp.value && followUp.value > date.value)) {
        return { error: "Choose a valid activity date and a follow-up date on or before it." };
    }
    value.date = date.value; value.followUpDate = followUp.value;
    value.startTime = body.startTime ?? "";
    if (typeof value.startTime !== "string" || (value.startTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.startTime))) return { error: "Use a Sri Lanka time in HH:MM format." };
    if (!["string", "number"].includes(typeof body.participants) || !/^\d+$/.test(String(body.participants)) ||
        !Number.isSafeInteger(Number(body.participants)) || Number(body.participants) < 1) return { error: "Enter a positive whole participant count." };
    value.participants = Number(body.participants);
    if (!excursionsFitBooking([value], booking)) return { error: "The activity must fit the trip dates and booking traveler count." };
    return { value };
};

const transitionExcursion = (item, body, booking, now = new Date()) => {
    const status = body?.status;
    if (!TRANSITIONS[item.status]?.includes(status)) return { error: "That status change is not available. Reload the activity." };
    if (body.confirmed !== true) return { error: "Confirm that the selected action actually happened." };
    const note = body.note ?? "";
    const reference = body.confirmationReference ?? "";
    if (!clean(note, 300) || !clean(reference, 100)) return { error: "Use a single-line note (300 characters) and reference (100 characters)." };
    if (["Cancellation requested", "Cancelled", "Planned"].includes(status) && note.trim().length < 3) return { error: "Enter a reason or supplier cancellation acknowledgement (at least 3 characters)." };
    if (["Cancelled", "Completed"].includes(booking.bookingStatus) && !["Cancellation requested", "Cancelled"].includes(status) &&
        !(booking.bookingStatus === "Completed" && status === "Completed")) return { error: "This booking is closed. Only cancellation follow-up or recording a finished activity is available." };
    if (status === "Requested" && !item.supplierName) return { error: "Enter the supplier before recording a request." };
    if (status === "Confirmed" && (!reference.trim() || !item.supplierName || !item.startTime || !item.meetingPoint)) return { error: "Confirmation needs a supplier reference, start time and meeting point." };
    if (status === "Completed" && day(item.date) > today(now)) return { error: "A future activity cannot be marked completed." };
    if (status === "Planned" && !excursionsFitBooking([{ ...item, status }], booking)) return { error: "Correct the trip dates or traveler count before reopening this activity." };
    return { value: { status, note: note.trim(), confirmationReference: status === "Confirmed" ? reference.trim() :
        status === "Planned" ? "" : item.confirmationReference, followUpDate: ["Confirmed", "Completed", "Cancelled"].includes(status) ? null : item.followUpDate } };
};

const buildExcursionMessage = (item, booking, audience) => {
    if (!["supplier", "guest", "cancellation"].includes(audience)) return { error: "Choose a supplier, cancellation or guest draft." };
    const cancelling = audience === "cancellation" || item.status === "Cancellation requested";
    if (audience === "cancellation" && !["Requested", "Confirmed", "Cancellation requested"].includes(item.status)) return { error: "Only a requested or confirmed reservation needs a supplier cancellation draft." };
    if (audience === "guest" && (item.status !== "Confirmed" || ["Cancelled", "Completed"].includes(booking.bookingStatus))) {
        return { error: "Guest instructions are available only for a confirmed activity on an open booking." };
    }
    if (audience !== "guest" && (!item.supplierName || ["Completed", "Cancelled"].includes(item.status) ||
        (["Cancelled", "Completed"].includes(booking.bookingStatus) && !cancelling))) return { error: "Review the supplier and cancellation status before preparing this draft." };
    const lines = audience === "guest" ? ["Hello,", "", "Here are your confirmed activity details:"] :
        ["Dear Reservations Team,", "", cancelling ? "Please cancel the following reservation and confirm any cancellation charges:" :
            "Please confirm availability and reservation details for the following activity:"];
    lines.push(`Booking: ${booking.bookingCode}`, `Activity: ${item.title}`, `Supplier: ${item.supplierName}`,
        `Date: ${formatDocumentDate(item.date)}`, `Time (Sri Lanka): ${item.startTime || "To be agreed"}`,
        `Participants: ${item.participants}`, `Meeting point: ${item.meetingPoint || "To be agreed"}`);
    if (item.confirmationReference) lines.push(`Supplier reference: ${item.confirmationReference}`);
    if (audience === "guest" && item.guestInstructions) lines.push("", item.guestInstructions);
    if (audience === "supplier" && !cancelling) lines.push("", "Please reply with your confirmation reference, meeting arrangements, payment and cancellation terms.");
    return { value: { recipient: audience !== "guest" ? item.supplierEmail : "",
        subject: `${cancelling ? "Cancellation request" : audience === "guest" ? "Activity details" : "Activity reservation"} - ${booking.bookingCode}`,
        body: lines.join("\n") } };
};

module.exports = { TYPES, STATUSES, TRANSITIONS, FIELDS, clean, day, today, excursionsFitBooking,
    parseExcursion, transitionExcursion, buildExcursionMessage };
