const { getBusinessDayBounds } = require("./businessDate");
const { parseCalendarDate } = require("./paymentDueDate");

const itineraryFitsTrip = (days, travelStartDate, travelEndDate) => {
    const start = new Date(travelStartDate);
    const end = new Date(travelEndDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
    const tripStart = getBusinessDayBounds(start).start;
    const tripEnd = getBusinessDayBounds(end).end;
    return tripStart <= tripEnd && days.every(({ date }) => {
        const value = new Date(date);
        return !Number.isNaN(value.getTime()) && value >= tripStart && value <= tripEnd;
    });
};

const parseItineraryDay = (body, booking) => {
    const parsedDate = parseCalendarDate(body?.date, "Itinerary date");
    if (parsedDate.error || !parsedDate.value) {
        return { error: parsedDate.error || "Itinerary date is required" };
    }

    const text = {};
    for (const [field, label, maxLength] of [
        ["title", "Day title", 120],
        ["plan", "Daily plan", 800],
        ["overnightLocation", "Overnight location", 120],
    ]) {
        const input = body?.[field] ?? "";
        if (typeof input !== "string") return { error: `${label} must be text` };
        text[field] = input.trim();
        if (text[field].length > maxLength) return { error: `${label} must be at most ${maxLength} characters` };
    }
    if (!text.title) return { error: "Day title is required" };
    if (!itineraryFitsTrip([{ date: parsedDate.value }], booking.travelStartDate, booking.travelEndDate)) {
        return { error: "Itinerary date must be within the trip dates" };
    }

    return { value: { date: parsedDate.value, ...text } };
};

module.exports = { itineraryFitsTrip, parseItineraryDay };
