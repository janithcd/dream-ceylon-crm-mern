const { parseCalendarDate } = require("./paymentDueDate");
const { parseCostPayload } = require("./costProfit");

const validId = (value) => typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
const COST_CATEGORY = Object.freeze({ Hotel: "Hotel", Guide: "Guide", Transport: "Transport",
    "Safari jeep": "Activities", Activity: "Activities", Other: "Other" });

const parseRateSelection = (body) => {
    if (!validId(body?.supplierId) || !validId(body?.rateId) ||
        !Number.isSafeInteger(body?.expectedVersion) || body.expectedVersion < 0) {
        return { error: "Choose a supplier rate from the latest list." };
    }
    const quantity = Number(body.quantity);
    if (!["string", "number"].includes(typeof body.quantity) || String(body.quantity).trim() === "" ||
        !Number.isInteger(quantity) || quantity < 1 || quantity > 1000) {
        return { error: "Enter a whole number of units between 1 and 1000." };
    }
    const from = parseCalendarDate(body.serviceFrom, "Service start date");
    const to = parseCalendarDate(body.serviceTo, "Service end date");
    if (from.error || to.error || !from.value || !to.value || to.value < from.value) {
        return { error: "Choose valid service dates, with the end on or after the start." };
    }
    return { value: { quantity, serviceFrom: from.value, serviceTo: to.value } };
};

const buildRateEstimate = (selection, supplier, rate, quotation, conversionRate) => {
    if (supplier.status !== "Active" || rate.status !== "Active" ||
        String(rate.supplier) !== String(supplier._id)) {
        return { error: "This supplier rate is no longer active. Refresh and choose another." };
    }
    if (selection.serviceFrom < rate.validFrom || selection.serviceTo > rate.validTo) {
        return { error: "The supplier rate does not cover all the selected service dates." };
    }
    if ((quotation.travelStartDate && selection.serviceFrom < quotation.travelStartDate) ||
        (quotation.travelEndDate && selection.serviceTo > quotation.travelEndDate)) {
        return { error: "Choose service dates within this quotation's travel dates." };
    }
    const cents = Math.round(rate.amount * 100) * selection.quantity;
    if (!Number.isSafeInteger(cents) || cents > 100000000000) {
        return { error: "The rate total exceeds the maximum supplier cost." };
    }
    const description = `${supplier.name} · ${rate.service}${rate.mealPlan ? ` · ${rate.mealPlan}` : ""} · ${selection.quantity} × ${rate.unit}`;
    const parsed = parseCostPayload({ category: COST_CATEGORY[supplier.category],
        description: description.slice(0, 200), amount: cents / 100, currency: rate.currency, conversionRate,
    }, quotation.currency);
    if (parsed.error) return parsed;
    return { value: { ...parsed.value, rateSource: {
        supplier: supplier._id, rate: rate._id, supplierName: supplier.name,
        service: rate.service, unit: rate.unit, mealPlan: rate.mealPlan,
        occupancy: rate.occupancy, rateAmount: rate.amount, rateCurrency: rate.currency, rateRevision: rate.revision,
        sourceReference: rate.sourceReference, validFrom: rate.validFrom, validTo: rate.validTo,
        serviceFrom: selection.serviceFrom, serviceTo: selection.serviceTo,
        quantity: selection.quantity,
    } } };
};

module.exports = { parseRateSelection, buildRateEstimate };
