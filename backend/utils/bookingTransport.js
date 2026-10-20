const STATUSES = ["Requested", "Confirmed", "Cancelled"];

const parseDate = (value) => {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
};

const parseFlight = (input) => {
    if (input == null) return { value: null };
    if (typeof input !== "object" || Array.isArray(input)) {
        return { error: "Flight details must be an object or null" };
    }
    if (!["Arrival", "Departure"].includes(input.direction)) {
        return { error: "Choose an arrival or departure flight" };
    }
    const value = { direction: input.direction };
    for (const [field, label, maxLength] of [
        ["number", "Flight number", 20], ["airport", "Airport", 120], ["terminal", "Terminal", 60],
    ]) {
        const text = input[field] ?? "";
        if (typeof text !== "string" || text.trim().length > maxLength) {
            return { error: label + " must be text of at most " + maxLength + " characters" };
        }
        value[field] = text.trim();
    }
    if (!value.number) return { error: "Flight number is required" };
    value.number = value.number.toUpperCase();
    value.date = parseDate(input.date);
    if (!value.date) return { error: "Choose a valid scheduled flight date" };
    value.time = input.time ?? "";
    if (typeof value.time !== "string" || (value.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time))) {
        return { error: "Scheduled flight time must be in 24-hour HH:mm format" };
    }
    return { value };
};

const registrationKey = (value) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");

const parseTransportAssignment = (body, existing = {}) => {
    const value = {};

    for (const [field, maxLength] of [
        ["route", 120], ["pickupLocation", 120], ["dropoffLocation", 120],
        ["vehicleDescription", 100], ["registration", 24],
        ["chauffeurName", 100], ["chauffeurPhone", 32], ["notes", 500],
    ]) {
        const input = body[field] !== undefined ? body[field] : existing[field];
        if (input !== undefined && (typeof input !== "string" || input === null)) {
            return { error: `${field} must be text` };
        }
        value[field] = (input || "").trim();
        if (value[field].length > maxLength) return { error: `${field} is too long` };
    }

    if (!value.route) return { error: "Route or service description is required" };
    value.registrationKey = registrationKey(value.registration);
    if (value.registration && !value.registrationKey) {
        return { error: "Registration must contain letters or numbers" };
    }

    value.startDate = parseDate(body.startDate ?? existing.startDate);
    value.endDate = parseDate(body.endDate ?? existing.endDate);
    if (!value.startDate || !value.endDate || value.endDate < value.startDate) {
        return { error: "Choose valid start and end dates" };
    }

    const followUpInput = body.followUpDate !== undefined ? body.followUpDate : existing.followUpDate;
    value.followUpDate = followUpInput === "" || followUpInput == null ? null : parseDate(followUpInput);
    if ((followUpInput !== "" && followUpInput != null && !value.followUpDate) ||
        (value.followUpDate && value.followUpDate > value.startDate)) {
        return { error: "Follow-up must be a valid date on or before transport starts" };
    }

    value.pickupTime = body.pickupTime ?? existing.pickupTime ?? "";
    if (typeof value.pickupTime !== "string" || (value.pickupTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.pickupTime))) {
        return { error: "Pickup time must be in 24-hour HH:mm format" };
    }

    const flight = parseFlight(body.flight !== undefined ? body.flight : existing.flight);
    if (flight.error) return flight;
    value.flight = flight.value;

    value.status = body.status ?? existing.status ?? "Requested";
    if (!STATUSES.includes(value.status)) return { error: "Choose a valid transport status" };

    return { value };
};

const datesOverlap = (first, second) =>
    first.startDate <= second.endDate && first.endDate >= second.startDate;

module.exports = { STATUSES, parseTransportAssignment, datesOverlap };
