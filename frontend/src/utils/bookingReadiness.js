import { toCalendarDateInput, todayCalendarDate } from "./calendarDate.js";
import { getHotelNightCoverage } from "./hotelNightCoverage.js";
import { normalizeWhatsAppNumber } from "./whatsappFollowUp.js";

const DAY_MS = 86400000;
const hasText = (value) => typeof value === "string" && value.trim().length > 0;
const validTime = (value) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value || "");
const count = (value, singular, plural = `${singular}s`) => `${value} ${value === 1 ? singular : plural}`;
const dayNumber = (value) => {
    const day = toCalendarDateInput(value);
    return day ? Date.parse(`${day}T00:00:00Z`) / DAY_MS : null;
};
const dateRange = (start, end) => {
    const from = dayNumber(start);
    const to = dayNumber(end);
    return from !== null && to !== null && to >= from ? { from, to } : null;
};
const section = (id, title, summary, issues = [], assessed = true) => ({
    id, title, summary, issues,
    status: issues.length ? "attention" : assessed ? "clear" : "unassessed",
});

// This reviews recorded operations data, not whether every service is in scope.
// Financial records, private notes and guest contact values never enter the result.
export const getBookingReadiness = (booking, now = new Date()) => {
    if (["Completed", "Cancelled"].includes(booking.bookingStatus)) {
        return { inactive: true, sections: [], attentionCount: 0, unassessedCount: 0 };
    }

    const trip = dateRange(booking.travelStartDate, booking.travelEndDate);
    const details = [];
    if (!["Confirmed", "In Progress"].includes(booking.bookingStatus)) details.push("Booking is not confirmed.");
    if (!trip) details.push("Travel dates are missing or invalid.");
    if (!hasText(booking.customer?.fullName)) details.push("Lead guest name is missing.");
    if (!hasText(booking.customer?.email)) details.push("Guest email is missing.");
    if (!normalizeWhatsAppNumber(booking.customer?.whatsappNumber || "")) {
        details.push("Guest WhatsApp number needs a full international number with country code.");
    }
    if (!Number.isInteger(booking.numberOfTravelers) || booking.numberOfTravelers < 1) {
        details.push("Traveler count is missing or invalid.");
    }
    const sections = [section("booking", "Booking & guest", "Checks booking status, travel dates, guest name, contact fields, and traveler count.", details)];

    const namedCount = Array.isArray(booking.travelerNames) ? booking.travelerNames.length : 0;
    const headcount = booking.numberOfTravelers;
    const rosterIssues = [];
    if (namedCount > 0 && Number.isInteger(headcount) && namedCount < headcount) {
        rosterIssues.push(`${count(headcount - namedCount, "traveler name")} still missing.`);
    }
    if (namedCount > 0 && Number.isInteger(headcount) && namedCount > headcount) {
        rosterIssues.push("More names are saved than the booking traveler count. Check the booking headcount.");
    }
    sections.push(section("travelers", "Traveler roster", !namedCount
        ? "No traveler names are recorded. The booking contact may not be traveling."
        : `${namedCount} of ${Number.isInteger(headcount) && headcount > 0 ? headcount : "the booked"} travelers named. Names stay in the roster and are not shown in this review.`,
    rosterIssues, Boolean(namedCount && Number.isInteger(headcount) && headcount > 0)));

    const days = booking.itineraryDays || [];
    const itineraryIssues = [];
    if (days.length && trip) {
        const recorded = days.map((day) => dayNumber(day.date));
        const withinTrip = recorded.filter((day) => day !== null && day >= trip.from && day <= trip.to);
        const uniqueDays = new Set(withinTrip);
        const missingDays = trip.to - trip.from + 1 - uniqueDays.size;
        if (missingDays) itineraryIssues.push(`${count(missingDays, "trip day")} without an itinerary entry.`);
        if (recorded.some((day) => day === null)) itineraryIssues.push("Some itinerary entries have invalid dates.");
        if (recorded.some((day) => day !== null && (day < trip.from || day > trip.to))) itineraryIssues.push("Some itinerary entries fall outside the trip dates.");
        if (withinTrip.length > uniqueDays.size) itineraryIssues.push("More than one itinerary entry is saved for the same day.");
    }
    if (days.some((day) => !hasText(day.title))) itineraryIssues.push("Some itinerary entries are missing a title.");
    sections.push(section("itinerary", "Itinerary", !days.length
        ? "No itinerary is recorded. Check whether a day plan is needed for this booking."
        : !trip ? "Save valid travel dates to check itinerary coverage."
            : `${count(days.length, "itinerary entry", "itinerary entries")} saved; arrival and departure days are included in coverage.`,
    itineraryIssues, Boolean(days.length && trip)));

    const stays = (booking.hotelStays || []).filter((stay) => stay.status !== "Cancelled");
    const hotelIssues = [];
    const requestedStays = stays.filter((stay) => stay.status !== "Confirmed").length;
    if (requestedStays) hotelIssues.push(`${count(requestedStays, "hotel stay")} awaiting confirmation.`);
    const invalidStays = stays.filter((stay) => {
        const range = dateRange(stay.checkInDate, stay.checkOutDate);
        return !range || range.from === range.to;
    }).length;
    if (invalidStays) hotelIssues.push(`${count(invalidStays, "hotel stay")} with invalid check-in or check-out dates.`);
    const coverage = stays.length && trip ? getHotelNightCoverage(booking, stays) : null;
    if (coverage?.missingNights) hotelIssues.push(`${count(coverage.missingNights, "trip night")} without an active hotel stay. Check whether these nights are guest-arranged.`);
    if (coverage?.multipleStayNights) hotelIssues.push(`${count(coverage.multipleStayNights, "night")} with overlapping hotel stays. Check whether this is intentional.`);
    const outsideStays = stays.filter((stay) => {
        const range = dateRange(stay.checkInDate, stay.checkOutDate);
        return trip && range && (range.from < trip.from || range.to > trip.to);
    }).length;
    if (outsideStays) hotelIssues.push(`${count(outsideStays, "hotel stay")} extending outside the trip dates.`);
    sections.push(section("hotels", "Hotels", !stays.length
        ? "No active hotel stays are recorded. Hotels may be guest-arranged or outside this booking's scope."
        : !trip ? "Save valid travel dates to check hotel night coverage."
            : coverage ? `${coverage.confirmedNights} of ${count(coverage.totalNights, "trip night")} covered by confirmed stays.`
                : "This is a same-day trip; no overnight stay is expected within the trip dates.",
    hotelIssues, Boolean(stays.length && trip)));

    const assignments = (booking.transportAssignments || []).filter((item) => item.status !== "Cancelled");
    const transportIssues = [];
    const requestedTransport = assignments.filter((item) => item.status !== "Confirmed").length;
    if (requestedTransport) transportIssues.push(`${count(requestedTransport, "transport leg")} awaiting confirmation.`);
    assignments.forEach((item, index) => {
        const label = hasText(item.route) ? item.route.trim() : `Transport leg ${index + 1}`;
        const range = dateRange(item.startDate, item.endDate);
        if (!range) transportIssues.push(`${label}: start or end date is missing or invalid.`);
        else if (trip && (range.from < trip.from || range.to > trip.to)) transportIssues.push(`${label}: dates extend outside the trip.`);
        const missing = [];
        if (item.status === "Confirmed") {
            for (const [field, title] of [
                ["chauffeurName", "chauffeur name"], ["chauffeurPhone", "chauffeur phone"],
                ["registration", "vehicle registration"], ["pickupLocation", "pickup location"],
                ["dropoffLocation", "drop-off location"],
            ]) {
                if (!hasText(item[field])) missing.push(title);
            }
            if (!validTime(item.pickupTime)) missing.push("valid pickup time");
        }
        // Flight time is separate from pickup time: overnight transfers are valid.
        if (item.flight) {
            if (!hasText(item.flight.number)) missing.push("flight number");
            if (!["Arrival", "Departure"].includes(item.flight.direction)) missing.push("flight direction");
            if (dayNumber(item.flight.date) === null) missing.push("flight date");
            if (!validTime(item.flight.time)) missing.push("scheduled flight time");
            if (!hasText(item.flight.airport)) missing.push("airport");
        }
        if (missing.length) transportIssues.push(`${label}: add ${missing.join(", ")}.`);
    });
    sections.push(section("transport", "Transport", !assignments.length
        ? "No active transport is recorded. Check whether transport is needed for this booking."
        : `${count(assignments.length, "active transport leg")}. Checks saved details; vehicle availability is reviewed in Transport.`,
    transportIssues, Boolean(assignments.length && trip)));

    const tasks = booking.preparationTasks || [];
    const openTasks = tasks.filter((task) => !task.completedAt);
    const today = todayCalendarDate(now);
    const overdue = openTasks.filter((task) => {
        const due = toCalendarDateInput(task.dueDate);
        return due && due < today;
    }).length;
    const unassigned = openTasks.filter((task) => !task.assignedTo).length;
    const taskIssues = [];
    if (openTasks.length) taskIssues.push(`${count(openTasks.length, "preparation task")} still open.`);
    if (overdue) taskIssues.push(`${count(overdue, "open task")} overdue in Sri Lanka time.`);
    if (unassigned) taskIssues.push(`${count(unassigned, "open task")} without an assignee.`);
    sections.push(section("tasks", "Preparation tasks", tasks.length
        ? `${tasks.length - openTasks.length} of ${count(tasks.length, "task")} completed.`
        : "No preparation tasks are recorded. Check whether any handoff work is needed.", taskIssues, Boolean(tasks.length)));

    return {
        inactive: false,
        sections,
        attentionCount: sections.filter((item) => item.status === "attention").length,
        unassessedCount: sections.filter((item) => item.status === "unassessed").length,
    };
};
