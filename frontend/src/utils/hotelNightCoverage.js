import { toCalendarDateInput } from "./calendarDate.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const dayNumber = (value) => {
    const date = toCalendarDateInput(value);
    if (!date) return null;
    const time = Date.parse(date + "T00:00:00.000Z");
    return Number.isFinite(time) ? Math.floor(time / DAY_MS) : null;
};

const asDate = (day) => new Date(day * DAY_MS).toISOString().slice(0, 10);

const addRange = (ranges, start, end) => {
    const previous = ranges.at(-1);
    if (previous?.end === start) previous.end = end;
    else ranges.push({ start, end });
};

const describeRanges = (ranges) => ranges.map(({ start, end }) => ({
    from: asDate(start),
    to: asDate(end - 1),
    nights: end - start,
}));

// A hotel check-out day is not a night. Count distinct booking nights, not rooms.
export const getHotelNightCoverage = (booking, stays = booking?.hotelStays || []) => {
    const start = dayNumber(booking?.travelStartDate);
    const end = dayNumber(booking?.travelEndDate);
    if (start === null || end === null || end <= start) return null;

    const active = stays
        .filter((stay) => stay.status !== "Cancelled")
        .map((stay) => ({
            stay,
            start: dayNumber(stay.checkInDate),
            end: dayNumber(stay.checkOutDate),
        }))
        .filter(({ start: checkIn, end: checkOut }) =>
            checkIn !== null && checkOut !== null && checkOut > checkIn
        );

    const relevant = active.filter((stay) => stay.start < end && stay.end > start);
    const boundaries = new Set([start, end]);
    for (const stay of relevant) {
        boundaries.add(Math.max(start, stay.start));
        boundaries.add(Math.min(end, stay.end));
    }

    const ordered = [...boundaries].sort((a, b) => a - b);
    const missing = [];
    const requestedOnly = [];
    const multiple = [];
    let confirmedNights = 0;
    let requestedOnlyNights = 0;
    let missingNights = 0;
    let multipleStayNights = 0;

    for (let index = 0; index < ordered.length - 1; index += 1) {
        const from = ordered[index];
        const to = ordered[index + 1];
        const nights = to - from;
        const covering = relevant.filter((stay) => stay.start <= from && stay.end >= to);
        if (covering.length === 0) {
            missingNights += nights;
            addRange(missing, from, to);
        } else if (covering.some(({ stay }) => stay.status === "Confirmed")) {
            confirmedNights += nights;
        } else {
            requestedOnlyNights += nights;
            addRange(requestedOnly, from, to);
        }
        if (covering.length > 1) {
            multipleStayNights += nights;
            addRange(multiple, from, to);
        }
    }

    return {
        totalNights: end - start,
        activeStays: active.length,
        confirmedNights,
        requestedOnlyNights,
        missingNights,
        multipleStayNights,
        missingRanges: describeRanges(missing),
        requestedOnlyRanges: describeRanges(requestedOnly),
        multipleStayRanges: describeRanges(multiple),
        outsideTrip: active
            .filter((stay) => stay.start < start || stay.end > end)
            .map(({ stay }) => ({
                id: stay._id,
                hotelName: stay.hotelName,
                checkInDate: stay.checkInDate,
                checkOutDate: stay.checkOutDate,
            })),
    };
};
