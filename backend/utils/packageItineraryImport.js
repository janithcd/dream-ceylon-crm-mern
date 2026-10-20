const { parseCalendarDate } = require("./paymentDueDate");
const { parseItineraryDay } = require("./bookingItinerary");

const DAY_MS = 24 * 60 * 60 * 1000;

const buildPackageItineraryImport = (tourPackage, booking, startDate) => {
    const parsed = parseCalendarDate(startDate, "Import start date");
    if (parsed.error || !parsed.value) {
        return { error: parsed.error || "Import start date is required" };
    }
    const template = tourPackage.itinerary || [];
    if (!template.length) return { error: "The selected package has no itinerary to import" };
    if (template.length > 60) return { error: "A booking can have at most 60 itinerary entries" };
    if (!Number.isInteger(tourPackage.durationDays) || tourPackage.durationDays < 1) {
        return { error: "The selected package has an invalid duration" };
    }

    const days = [];
    for (const item of template) {
        if (!Number.isInteger(item.day) || item.day < 1 || item.day > tourPackage.durationDays) {
            return { error: "The package has an invalid itinerary day. Update the package before importing." };
        }
        const date = new Date(parsed.value.getTime() + (item.day - 1) * DAY_MS);
        if (!Number.isFinite(date.getTime())) {
            return { error: "The package has an invalid itinerary day. Update the package before importing." };
        }
        const result = parseItineraryDay({
            date: date.toISOString().slice(0, 10),
            title: item.title,
            plan: item.description,
            overnightLocation: "",
        }, booking);
        if (result.error) return { error: `Package day ${item.day}: ${result.error}` };
        days.push(result.value);
    }

    days.sort((left, right) => left.date - right.date);
    return { days };
};

module.exports = { buildPackageItineraryImport };
