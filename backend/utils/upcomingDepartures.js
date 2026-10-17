const { getBusinessDayBounds } = require("./businessDate");

const DAY_MS = 24 * 60 * 60 * 1000;

const getUpcomingDepartureQuery = (now = new Date()) => {
    const { start, end } = getBusinessDayBounds(now);

    return {
        travelStartDate: {
            $gte: start,
            $lte: new Date(end.getTime() + 30 * DAY_MS),
        },
        bookingStatus: { $in: ["Pending", "Confirmed", "In Progress"] },
    };
};

module.exports = { getUpcomingDepartureQuery };
