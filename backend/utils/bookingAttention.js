const { getUpcomingDepartureQuery } = require("./upcomingDepartures");
const { getBusinessDayBounds } = require("./businessDate");

const getBookingAttentionQuery = (now = new Date()) => ({
    ...getUpcomingDepartureQuery(now),
    $or: [
        { hotelStays: { $elemMatch: { status: "Requested" } } },
        { transportAssignments: { $elemMatch: { status: "Requested" } } },
        { preparationTasks: { $elemMatch: { completedAt: null } } },
    ],
});

const summarizeBookingAttention = (booking, now = new Date()) => {
    const { start } = getBusinessDayBounds(now);
    const openTasks = (booking.preparationTasks || []).filter((task) => task.completedAt == null);

    return {
        _id: booking._id,
        bookingCode: booking.bookingCode,
        customerName: booking.customer?.fullName || "",
        travelStartDate: booking.travelStartDate,
        pendingHotelCount: (booking.hotelStays || []).filter((stay) => stay.status === "Requested").length,
        pendingTransportCount: (booking.transportAssignments || []).filter((item) => item.status === "Requested").length,
        openTaskCount: openTasks.length,
        overdueTaskCount: openTasks.filter((task) => task.dueDate && new Date(task.dueDate) < start).length,
    };
};

module.exports = { getBookingAttentionQuery, summarizeBookingAttention };
