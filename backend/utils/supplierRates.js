const { parseCalendarDate } = require("./paymentDueDate");
const { getBusinessDayBounds } = require("./businessDate");

const UNITS = Object.freeze(["Room per night", "Person per night", "Day", "Trip", "Person", "Vehicle per day", "Other"]);
const MEAL_PLANS = Object.freeze(["Room Only", "Bed & Breakfast", "Half Board", "Full Board", "All Inclusive", "Other"]);
const CURRENCIES = Object.freeze(["USD", "LKR", "EUR", "GBP"]);
const STATUSES = Object.freeze(["Active", "Inactive"]);
const key = (value) => value.replace(/\s+/gu, " ").trim().toLocaleLowerCase("en");
const safeText = (raw, max, multiline = false) => {
    if (typeof raw !== "string") return null;
    const text = raw.replace(/\r\n/g, "\n").trim();
    const invalid = multiline ? /[\u0000-\u0009\u000b-\u001f\u007f\u2028\u2029\u202a-\u202e\u2066-\u2069]/u
        : /[\p{Cc}\u2028\u2029\u202a-\u202e\u2066-\u2069]/u;
    return text.length > max || invalid.test(text) ? null : text;
};

const parseSupplierRate = (body, category) => {
    if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Enter rate details." };
    const service = safeText(body.service, 160);
    const sourceReference = safeText(body.sourceReference, 160);
    const notes = safeText(body.notes ?? "", 500, true);
    if (!service || service.length < 2) return { error: "Enter the room or service name (2–160 characters)." };
    if (!sourceReference || sourceReference.length < 3) return { error: "Enter the supplier quote or rate-sheet reference (3–160 characters)." };
    if (notes === null) return { error: "Notes must be at most 500 characters." };
    if (!UNITS.includes(body.unit)) return { error: "Choose a rate unit." };
    if (!CURRENCIES.includes(body.currency)) return { error: "Choose a rate currency." };
    const amount = Number(body.amount);
    if (!["string", "number"].includes(typeof body.amount) || String(body.amount).trim() === "" ||
        !Number.isFinite(amount) || amount < 0.01 || amount > 1000000000 || Math.round(amount * 100) / 100 !== amount) {
        return { error: "Enter a positive rate up to 1,000,000,000 with at most two decimal places." };
    }
    const from = parseCalendarDate(body.validFrom, "Valid from");
    const to = parseCalendarDate(body.validTo, "Valid to");
    if (from.error || !from.value || to.error || !to.value || to.value < from.value) {
        return { error: "Enter a valid from and to date; the end must not precede the start." };
    }
    const status = body.status ?? "Active";
    if (!STATUSES.includes(status)) return { error: "Choose Active or Inactive." };
    const mealPlan = category === "Hotel" ? body.mealPlan : "";
    const occupancy = category === "Hotel" ? Number(body.occupancy) : null;
    if (category === "Hotel" && (!MEAL_PLANS.includes(mealPlan) || !Number.isInteger(occupancy) || occupancy < 1 || occupancy > 10)) {
        return { error: "For hotel rates, choose a meal plan and an occupancy of 1–10 guests." };
    }
    return { value: { service, serviceKey: key(service), unit: body.unit, mealPlan, occupancy,
        amount, currency: body.currency, validFrom: from.value, validTo: to.value,
        sourceReference, notes, status } };
};

const parseRateList = (params = {}, now = new Date()) => {
    const status = params.status ?? "Active", timing = params.timing ?? "All";
    const page = params.page ?? "1", limit = params.limit ?? "20";
    if (![...STATUSES, "All"].includes(status) || !["All", "Current", "Upcoming", "Expired"].includes(timing)) {
        return { error: "Choose a valid rate status and date filter." };
    }
    if (!/^[1-9]\d*$/.test(String(page)) || !/^[1-9]\d*$/.test(String(limit)) ||
        Number(page) > 1000 || Number(limit) > 50) return { error: "Choose page 1–1000 and limit 1–50." };
    const today = new Date(getBusinessDayBounds(now).start.getTime() + 330 * 60 * 1000);
    const dates = timing === "Current" ? { validFrom: { $lte: today }, validTo: { $gte: today } }
        : timing === "Upcoming" ? { validFrom: { $gt: today } }
            : timing === "Expired" ? { validTo: { $lt: today } } : {};
    return { value: { page: Number(page), limit: Number(limit), filter: {
        ...(status === "All" ? {} : { status }), ...dates,
    } } };
};

const overlapQuery = (supplier, value, excludeId) => ({ supplier,
    status: "Active", serviceKey: value.serviceKey, unit: value.unit,
    mealPlan: value.mealPlan, occupancy: value.occupancy, currency: value.currency,
    validFrom: { $lte: value.validTo }, validTo: { $gte: value.validFrom },
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
});

module.exports = { UNITS, MEAL_PLANS, CURRENCIES, parseSupplierRate, parseRateList, overlapQuery };
