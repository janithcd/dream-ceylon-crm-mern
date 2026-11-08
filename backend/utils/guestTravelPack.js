const { createHash } = require("node:crypto");
const { buildGuestItinerary } = require("./guestItinerary");
const { formatDocumentDate } = require("./documentDate");
const { getBusinessDayBounds } = require("./businessDate");

const text = (value) => String(value ?? "").replace(/\s+/gu, " ").trim();
const day = (value) => {
    if (!value || Number.isNaN(new Date(value).getTime())) return "";
    return getBusinessDayBounds(new Date(value)).end.toISOString().slice(0, 10);
};
const validTime = (value) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text(value));

// This is the single guest-facing projection for both preview and PDF. Never
// spread booking, supplier, payment, or operational records into the document.
const buildGuestTravelPack = (booking, company = {}) => {
    const blockers = [], warnings = [], entries = [];
    const counts = { itinerary: 0, hotels: 0, transport: 0, activities: 0 };
    const start = day(booking.travelStartDate), end = day(booking.travelEndDate);
    const inTrip = (value) => day(value) && day(value) >= start && day(value) <= end;
    const tripDays = start && end ? Math.round((new Date(end) - new Date(start)) / 86400000) + 1 : 0;
    if (!["Confirmed", "In Progress"].includes(booking.bookingStatus)) blockers.push("Travel packs require a Confirmed or In Progress booking.");
    if (tripDays < 1 || tripDays > 366) blockers.push("Save valid trip dates spanning at most 366 days.");
    if (!text(booking.customer?.fullName)) blockers.push("Save the lead guest name.");
    if (!Number.isInteger(booking.numberOfTravelers) || booking.numberOfTravelers < 1) blockers.push("Save a valid booking traveler count.");
    const itinerary = buildGuestItinerary(booking);
    if (!itinerary.entries.length) blockers.push("Add the daily itinerary before preparing a travel pack.");
    for (const entry of itinerary.entries) {
        if (!inTrip(entry.date) || !text(entry.title)) { blockers.push("An itinerary entry has invalid details or falls outside the trip dates."); continue; }
        entries.push({ ...entry, date: day(entry.date), category: "Daily plan", details: [] }); counts.itinerary++;
    }
    if (tripDays > 0 && tripDays <= 366) {
        const plannedDates = new Set(entries.map((entry) => entry.date));
        const missing = tripDays - plannedDates.size;
        if (missing > 0) warnings.push(`${missing} trip date(s) have no daily itinerary entry. Review free days before sharing.`);
    }
    const missingDetail = (label, value, record) => {
        if (!text(value)) warnings.push(`${record}: ${label.toLowerCase()} is missing.`);
        return `${label}: ${text(value) || "To be confirmed"}`;
    };
    const pending = (items, label) => {
        const count = (items || []).filter((item) => !["Confirmed", "Completed", "Cancelled"].includes(item.status)).length;
        if (count) warnings.push(`${count} ${label} arrangement(s) are not confirmed and will be omitted.`);
    };
    pending(booking.hotelStays, "hotel"); pending(booking.transportAssignments, "transport"); pending(booking.excursions, "activity");
    for (const stay of booking.hotelStays || []) {
        if (stay.status !== "Confirmed") continue;
        const name = text(stay.hotelName);
        if (!name || !inTrip(stay.checkInDate) || !inTrip(stay.checkOutDate) || day(stay.checkOutDate) <= day(stay.checkInDate) || !Number.isInteger(stay.rooms) || stay.rooms < 1) {
            blockers.push("A confirmed hotel stay has invalid details or dates outside the trip. Correct it before sharing."); continue;
        }
        const record = `Hotel ${name}`;
        entries.push({ category: "Hotel", date: day(stay.checkInDate), title: `Hotel check-in: ${name}`, details: [
            "Reservation: Confirmed", `Check-in: ${formatDocumentDate(stay.checkInDate)} | Check-out: ${formatDocumentDate(stay.checkOutDate)}`,
            `Rooms: ${stay.rooms}`, missingDetail("Room type", stay.roomType, record), missingDetail("Meal plan", stay.mealPlan, record),
            ...(text(stay.location) ? [`Location: ${text(stay.location)}`] : []),
            missingDetail("Hotel reference", stay.confirmationNumber, record),
        ] }); counts.hotels++;
    }
    for (const transfer of booking.transportAssignments || []) {
        if (transfer.status !== "Confirmed") continue;
        const route = text(transfer.route);
        if (!route || !inTrip(transfer.startDate) || !inTrip(transfer.endDate) || day(transfer.endDate) < day(transfer.startDate)) {
            blockers.push("A confirmed transport arrangement has invalid details or dates outside the trip. Correct it before sharing."); continue;
        }
        const record = `Transport ${route}`;
        const details = ["Arrangement: Confirmed", `Service dates: ${formatDocumentDate(transfer.startDate)} to ${formatDocumentDate(transfer.endDate)}`,
            missingDetail("Pickup time (Sri Lanka)", validTime(transfer.pickupTime) ? transfer.pickupTime : "", record),
            missingDetail("Meeting point", transfer.pickupLocation, record), missingDetail("Drop-off", transfer.dropoffLocation, record),
            missingDetail("Chauffeur", transfer.chauffeurName, record), missingDetail("Chauffeur phone", transfer.chauffeurPhone, record),
            missingDetail("Vehicle", transfer.vehicleDescription, record), missingDetail("Registration", transfer.registration, record)];
        if (transfer.flight) {
            const flight = transfer.flight;
            details.push(`${text(flight.direction)} flight: ${text(flight.number) || "To be confirmed"}`,
                missingDetail("Flight date", day(flight.date) ? formatDocumentDate(flight.date) : "", record),
                missingDetail("Flight time (Sri Lanka)", validTime(flight.time) ? flight.time : "", record),
                missingDetail("Airport", flight.airport, record));
            if (text(flight.terminal)) details.push(`Terminal: ${text(flight.terminal)}`);
        }
        entries.push({ category: "Transport", date: day(transfer.startDate), title: `Transport: ${route}`, details }); counts.transport++;
    }
    for (const activity of booking.excursions || []) {
        if (!["Confirmed", "Completed"].includes(activity.status)) continue;
        const name = text(activity.title);
        if (!name || !inTrip(activity.date) || !Number.isInteger(activity.participants) || activity.participants < 1 || activity.participants > booking.numberOfTravelers) {
            blockers.push("A confirmed activity has invalid details, dates or participant count. Correct it before sharing."); continue;
        }
        const record = `Activity ${name}`;
        entries.push({ category: "Activity", date: day(activity.date), title: `Activity: ${name}`, details: [
            `Reservation: ${activity.status}`, missingDetail("Time (Sri Lanka)", validTime(activity.startTime) ? activity.startTime : "", record),
            `Participants: ${activity.participants}`, missingDetail("Operator", activity.supplierName, record),
            missingDetail("Meeting point", activity.meetingPoint, record), missingDetail("Confirmation reference", activity.confirmationReference, record),
            ...(text(activity.guestInstructions) ? [`Guest instructions: ${text(activity.guestInstructions)}`] : []),
        ] }); counts.activities++;
    }
    for (const [key, label] of [["hotels", "hotel stays"], ["transport", "transport arrangements"], ["activities", "activities"]]) {
        if (!counts[key]) warnings.push(`No confirmed ${label} are recorded. Check whether these are arranged independently or still need adding.`);
    }
    if (entries.length > 240) blockers.push("This travel pack exceeds 240 entries. Reduce duplicate itinerary or reservation records.");
    entries.sort((a, b) => a.date.localeCompare(b.date));
    const notice = "All times are in Sri Lanka local time. Daily plans describe the intended itinerary; only the separately listed reservations are confirmed. Pending and cancelled arrangements are omitted. Contact us for updates. This travel pack is not a payment receipt or an individual hotel voucher.";
    const pack = { bookingCode: text(booking.bookingCode), guestName: text(booking.customer?.fullName), travelStartDate: start,
        travelEndDate: end, numberOfTravelers: booking.numberOfTravelers, isDraft: false, entries, notice };
    const brand = { companyName: text(company.companyName), whatsapp: text(company.whatsapp), email: text(company.email), website: text(company.website) };
    const message = { recipient: text(booking.customer?.email), subject: `Your travel pack - ${pack.bookingCode}`,
        body: `Hello ${pack.guestName},\n\nPlease find attached your travel pack for ${formatDocumentDate(start)} to ${formatDocumentDate(end)}. It includes your daily itinerary and the confirmed arrangements currently recorded with us.\n\nPlease review the dates, meeting points and instructions, and let us know if anything needs updating. All times are in Sri Lanka local time.\n\nKind regards,\n${brand.companyName || "Dream Ceylon Journeys"}` };
    const result = { pack, brand, counts, warnings: [...new Set(warnings)], blockers: [...new Set(blockers)], message };
    return { ...result, ready: blockers.length === 0,
        fingerprint: createHash("sha256").update(JSON.stringify({ bookingId: String(booking._id), status: booking.bookingStatus, ...result })).digest("hex") };
};
module.exports = { buildGuestTravelPack };
