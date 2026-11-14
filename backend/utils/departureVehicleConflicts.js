const Booking = require("../models/Booking");
const { ACTIVE_BOOKING_STATUSES } = require("./myTasks");
const { datesOverlap } = require("./bookingTransport");

// One indexed candidate search for the current page. Only counts leave this function.
const countDepartureVehicleConflicts = async (bookings) => {
    const sources = bookings.flatMap((booking) => (booking.transportAssignments || [])
        .filter((item) => ["Requested", "Confirmed"].includes(item.status) && item.registrationKey &&
            item.startDate instanceof Date && item.endDate instanceof Date)
        .map((item) => ({ bookingId: String(booking._id), item })));
    const counts = new Map(bookings.map((booking) => [String(booking._id), 0]));
    if (!sources.length) return counts;

    const keys = [...new Set(sources.map(({ item }) => item.registrationKey))];
    const firstDate = new Date(Math.min(...sources.map(({ item }) => item.startDate.getTime())));
    const lastDate = new Date(Math.max(...sources.map(({ item }) => item.endDate.getTime())));
    const candidates = await Booking.find({
        bookingStatus: { $in: ACTIVE_BOOKING_STATUSES },
        transportAssignments: { $elemMatch: {
            status: "Confirmed", registrationKey: { $in: keys },
            startDate: { $lte: lastDate }, endDate: { $gte: firstDate },
        } },
    }).select("transportAssignments._id transportAssignments.status transportAssignments.registrationKey transportAssignments.startDate transportAssignments.endDate").lean();
    const confirmed = candidates.flatMap((booking) => (booking.transportAssignments || [])
        .filter((item) => item.status === "Confirmed" && keys.includes(item.registrationKey))
        .map((item) => ({ bookingId: String(booking._id), item })));
    for (const source of sources) {
        if (confirmed.some((candidate) => candidate.item.registrationKey === source.item.registrationKey &&
            !(candidate.bookingId === source.bookingId && String(candidate.item._id) === String(source.item._id)) &&
            datesOverlap(candidate.item, source.item))) {
            counts.set(source.bookingId, counts.get(source.bookingId) + 1);
        }
    }
    return counts;
};

module.exports = { countDepartureVehicleConflicts };
