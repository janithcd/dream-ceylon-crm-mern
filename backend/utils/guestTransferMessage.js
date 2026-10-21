const { formatDocumentDate } = require("./documentDate");
const { ACTIVE_BOOKING_STATUSES } = require("./myTasks");

const oneLine = (value) => String(value || "").replace(/\s+/gu, " ").trim();
const validTime = (value) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(oneLine(value));

// Only explicitly selected operational details belong in a guest message.
// Never interpolate whole booking/assignment objects or private supplier notes.
const buildGuestTransferMessage = (booking, assignment, company = {}) => {
    if (!ACTIVE_BOOKING_STATUSES.includes(booking.bookingStatus)) {
        return { error: "Guest pickup messages are available only for active bookings" };
    }
    if (assignment.status !== "Confirmed") {
        return { error: "Confirm the transport arrangement before preparing a guest message" };
    }
    const pickupDate = formatDocumentDate(assignment.startDate, { fallback: "" });
    if (!pickupDate) return { error: "Save a valid pickup date before preparing a guest message" };

    const guestName = oneLine(booking.customer?.fullName) || "there";
    const companyName = oneLine(company.companyName) || "Dream Ceylon Journeys";
    const bookingCode = oneLine(booking.bookingCode);
    const missingDetails = [];
    const requiredDetail = (label, value) => {
        const content = oneLine(value);
        if (!content) missingDetails.push(label);
        return `${label}: ${content || "To be confirmed"}`;
    };
    const lines = [
        `Hello ${guestName}, this is ${companyName}.`,
        "",
        `Here are your pickup details${bookingCode ? ` for booking ${bookingCode}` : ""}:`,
        `Route: ${oneLine(assignment.route) || "Transfer"}`,
        `Pickup date: ${pickupDate}`,
        requiredDetail("Pickup time", validTime(assignment.pickupTime) ? assignment.pickupTime : "") + " (Sri Lanka time)",
        requiredDetail("Meeting point", assignment.pickupLocation),
        requiredDetail("Drop-off", assignment.dropoffLocation),
        "",
        requiredDetail("Chauffeur", assignment.chauffeurName),
        requiredDetail("Chauffeur phone", assignment.chauffeurPhone),
        requiredDetail("Vehicle", [oneLine(assignment.vehicleDescription), oneLine(assignment.registration)].filter(Boolean).join(" - ")),
    ];
    const flight = assignment.flight;
    if (flight && ["Arrival", "Departure"].includes(flight.direction)) {
        const flightDate = formatDocumentDate(flight.date, { fallback: "" });
        const flightTime = validTime(flight.time) ? oneLine(flight.time) : "";
        if (!flightDate) missingDetails.push("Flight date");
        if (!flightTime) missingDetails.push("Flight time");
        lines.push(
            "",
            requiredDetail(`${flight.direction} flight`, flight.number),
            `Scheduled ${flight.direction.toLowerCase()}: ${flightDate || "Date not supplied"} at ${flightTime || "time to be confirmed"} (Sri Lanka time)`,
            requiredDetail("Airport", flight.airport),
        );
        if (oneLine(flight.terminal)) lines.push(`Terminal: ${oneLine(flight.terminal)}`);
    }
    lines.push("", "Please let us know if your travel plans change. Thank you!");
    if (oneLine(company.whatsapp)) lines.push(`For assistance: ${oneLine(company.whatsapp)}`);

    return { value: {
        bookingCode,
        guestName,
        number: oneLine(booking.customer?.whatsappNumber),
        message: lines.join("\n"),
        missingDetails,
    } };
};

module.exports = { buildGuestTransferMessage };
