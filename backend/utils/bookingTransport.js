const STATUSES = ["Requested", "Confirmed", "Cancelled"];

const parseDate = (value) => {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
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

    value.pickupTime = body.pickupTime ?? existing.pickupTime ?? "";
    if (typeof value.pickupTime !== "string" || (value.pickupTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.pickupTime))) {
        return { error: "Pickup time must be in 24-hour HH:mm format" };
    }

    value.status = body.status ?? existing.status ?? "Requested";
    if (!STATUSES.includes(value.status)) return { error: "Choose a valid transport status" };

    return { value };
};

const datesOverlap = (first, second) =>
    first.startDate <= second.endDate && first.endDate >= second.startDate;

module.exports = { STATUSES, parseTransportAssignment, datesOverlap };
