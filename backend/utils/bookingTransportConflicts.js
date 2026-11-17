const Booking = require("../models/Booking");
const { datesOverlap } = require("./bookingTransport");
const { ACTIVE_BOOKING_STATUSES } = require("./myTasks");

const getConflicts = async (booking) => {
    if (["Cancelled", "Completed"].includes(booking.bookingStatus)) return [];

    const active = (booking.transportAssignments || []).filter((item) =>
        ["Requested", "Confirmed"].includes(item.status) && item.registrationKey);
    if (!active.length) return [];

    const keys = [...new Set(active.map((item) => item.registrationKey))];
    const firstDate = new Date(Math.min(...active.map((item) => item.startDate.getTime())));
    const lastDate = new Date(Math.max(...active.map((item) => item.endDate.getTime())));
    const others = await Booking.find({
        _id: { $ne: booking._id },
        bookingStatus: { $in: ACTIVE_BOOKING_STATUSES },
        transportAssignments: { $elemMatch: {
            status: "Confirmed", registrationKey: { $in: keys },
            startDate: { $lte: lastDate }, endDate: { $gte: firstDate },
        } },
    }).select("bookingCode transportAssignments").lean();

    return active.map((item) => ({
        assignmentId: item._id,
        bookings: [booking, ...others].flatMap((other) => other.transportAssignments
            .filter((candidate) =>
                String(candidate._id) !== String(item._id) &&
                candidate.status === "Confirmed" &&
                candidate.registrationKey === item.registrationKey &&
                datesOverlap(item, candidate))
            .map((candidate) => ({
                bookingId: other._id, bookingCode: other.bookingCode, route: candidate.route,
                startDate: candidate.startDate, endDate: candidate.endDate,
            }))),
    })).filter((item) => item.bookings.length);
};

module.exports = { getConflicts };
