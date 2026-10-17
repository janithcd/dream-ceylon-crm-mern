const { getUpcomingDepartureQuery } = require("./upcomingDepartures");

const getBookingAttentionQuery = (now = new Date()) => ({
    ...getUpcomingDepartureQuery(now),
    $or: [
        { hotelStays: { $elemMatch: { status: "Requested" } } },
        { preparationTasks: { $elemMatch: { completedAt: null } } },
    ],
});

const summarizeBookingAttention = (booking) => ({
    _id: booking._id,
    bookingCode: booking.bookingCode,
    customerName: booking.customer?.fullName || "",
    travelStartDate: booking.travelStartDate,
    pendingHotelCount: (booking.hotelStays || []).filter((stay) => stay.status === "Requested").length,
    openTaskCount: (booking.preparationTasks || []).filter((task) => task.completedAt == null).length,
});

module.exports = { getBookingAttentionQuery, summarizeBookingAttention };
