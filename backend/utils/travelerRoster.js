const MAX_TRAVELERS = 60;

const parseTravelerNames = (value, bookingCount) => {
    if (!Array.isArray(value) || value.length > MAX_TRAVELERS || value.length > bookingCount) {
        return { error: `Enter no more than the booking's traveler count (maximum ${MAX_TRAVELERS}).` };
    }
    const names = [];
    for (const entry of value) {
        if (typeof entry !== "string" || /[\u0000-\u001f\u007f]/.test(entry)) {
            return { error: "Each traveler needs a single-line name." };
        }
        const name = entry.trim().replace(/ {2,}/g, " ");
        if (!name || name.length > 120) {
            return { error: "Each traveler name must be 1–120 characters." };
        }
        names.push(name);
    }
    return { names };
};

module.exports = { MAX_TRAVELERS, parseTravelerNames };
