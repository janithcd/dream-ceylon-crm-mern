const MEAL_PLANS = [
    "Room Only",
    "Bed & Breakfast",
    "Half Board",
    "Full Board",
    "All Inclusive",
    "Other",
];
const STAY_STATUSES = ["Requested", "Confirmed", "Cancelled"];
const validSupplierEmail = (value) => /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value);

const dateFromInput = (value) => {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
};

const parseHotelStay = (body, existing = {}) => {
    const value = {};

    for (const [field, maxLength] of [
        ["hotelName", 120], ["location", 120], ["roomType", 100],
        ["confirmationNumber", 100], ["cancellationTerms", 300], ["notes", 500],
    ]) {
        const input = body[field] !== undefined ? body[field] : existing[field];
        if (input !== undefined && input !== null && typeof input !== "string") {
            return { error: `${field} must be text` };
        }
        value[field] = (input || "").trim();
        if (value[field].length > maxLength) return { error: `${field} is too long` };
    }

    if (!value.hotelName) return { error: "Property name is required" };

    const emailInput = body.supplierEmail !== undefined ? body.supplierEmail : existing.supplierEmail;
    if (emailInput !== undefined && emailInput !== null && typeof emailInput !== "string") {
        return { error: "supplierEmail must be text" };
    }
    value.supplierEmail = (emailInput || "").trim().toLowerCase();
    if (value.supplierEmail.length > 254 ||
        (value.supplierEmail && !validSupplierEmail(value.supplierEmail))) {
        return { error: "Enter a valid supplier email address" };
    }

    value.checkInDate = dateFromInput(body.checkInDate ?? existing.checkInDate);
    value.checkOutDate = dateFromInput(body.checkOutDate ?? existing.checkOutDate);
    if (!value.checkInDate || !value.checkOutDate || value.checkOutDate <= value.checkInDate) {
        return { error: "Choose valid check-in and later check-out dates" };
    }

    const followUpInput = body.followUpDate !== undefined ? body.followUpDate : existing.followUpDate;
    value.followUpDate = followUpInput === "" || followUpInput == null ? null : dateFromInput(followUpInput);
    if ((followUpInput !== "" && followUpInput != null && !value.followUpDate) ||
        (value.followUpDate && value.followUpDate > value.checkInDate)) {
        return { error: "Follow-up must be a valid date on or before check-in" };
    }

    const deadlineInput = body.cancellationDeadline !== undefined ? body.cancellationDeadline : existing.cancellationDeadline;
    value.cancellationDeadline = deadlineInput === "" || deadlineInput == null ? null : dateFromInput(deadlineInput);
    if ((deadlineInput !== "" && deadlineInput != null && !value.cancellationDeadline) ||
        (value.cancellationDeadline && value.cancellationDeadline > value.checkInDate)) {
        return { error: "Cancellation deadline must be a valid date on or before check-in" };
    }

    value.rooms = Number(body.rooms ?? existing.rooms ?? 1);
    if (!Number.isInteger(value.rooms) || value.rooms < 1 || value.rooms > 20) {
        return { error: "Rooms must be a whole number from 1 to 20" };
    }

    value.mealPlan = body.mealPlan ?? existing.mealPlan ?? "Room Only";
    value.status = body.status ?? existing.status ?? "Requested";
    if (!MEAL_PLANS.includes(value.mealPlan) || !STAY_STATUSES.includes(value.status)) {
        return { error: "Choose a valid meal plan and reservation status" };
    }

    return { value };
};

module.exports = { MEAL_PLANS, STAY_STATUSES, parseHotelStay };
