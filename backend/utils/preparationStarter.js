const { getBusinessDayBounds } = require("./businessDate");

const DAY_MS = 24 * 60 * 60 * 1000;
const STARTER_TASKS = Object.freeze([
    { key: "accommodation", title: "Confirm accommodation", daysBeforeDeparture: 21 },
    { key: "transport", title: "Arrange vehicle and chauffeur", daysBeforeDeparture: 14 },
    { key: "guide", title: "Confirm guide", daysBeforeDeparture: 14 },
    { key: "itinerary", title: "Send final itinerary to client", daysBeforeDeparture: 3 },
]);

const starterOptions = (booking, now = new Date()) => {
    const today = getBusinessDayBounds(now).start;
    const todayDate = new Date(today.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
    const start = new Date(booking.travelStartDate);
    const departure = Number.isFinite(start.getTime()) ? start.toISOString().slice(0, 10) : "";
    const departureUtc = departure ? Date.parse(`${departure}T00:00:00.000Z`) : null;
    const existing = new Set((booking.preparationTasks || []).map((task) => task.title?.trim().toLowerCase()));

    return STARTER_TASKS.map(({ key, title, daysBeforeDeparture }) => {
        const suggestedDate = departureUtc === null ? null : new Date(departureUtc - daysBeforeDeparture * DAY_MS).toISOString().slice(0, 10);
        const dueDate = suggestedDate ? (suggestedDate < todayDate ? todayDate : suggestedDate) : null;
        return { key, title, daysBeforeDeparture, dueDate, alreadyAdded: existing.has(title.toLowerCase()) };
    });
};

module.exports = { STARTER_TASKS, starterOptions };
