const { roomingPlanState } = require("./roomingPlan");
const { getUpcomingDepartureQuery } = require("./upcomingDepartures");

const PAGE_SIZE = 20;

// Return operational counts only. Names, assignments, contact details and notes stay on the booking.
const summarizeDepartureReadiness = (booking) => {
    const namedCount = booking.travelerNames?.length || 0;
    const headcount = booking.numberOfTravelers || 0;
    const activeStays = (booking.hotelStays || []).filter((stay) => stay.status !== "Cancelled");
    const confirmedStays = activeStays.filter((stay) => stay.status === "Confirmed");
    const transport = (booking.transportAssignments || []).filter((item) => item.status !== "Cancelled");
    const openTasks = (booking.preparationTasks || []).filter((task) => !task.completedAt);
    const rooming = confirmedStays.map((stay) => roomingPlanState(booking, stay).status);

    const missingTravelerCount = Math.max(0, headcount - namedCount);
    const pendingHotelCount = activeStays.length - confirmedStays.length;
    const pendingTransportCount = transport.filter((item) => item.status !== "Confirmed").length;
    const missingRoomingCount = rooming.filter((status) => status === "none").length;
    const staleRoomingCount = rooming.filter((status) => status === "stale").length;
    const needsAction = booking.bookingStatus === "Pending" || missingTravelerCount > 0 ||
        pendingHotelCount > 0 || pendingTransportCount > 0 || openTasks.length > 0 || staleRoomingCount > 0;
    const needsReview = missingRoomingCount > 0 || !activeStays.length || !transport.length;

    return {
        _id: booking._id,
        bookingCode: booking.bookingCode,
        customerName: booking.customer?.fullName || "",
        travelStartDate: booking.travelStartDate,
        bookingStatus: booking.bookingStatus,
        namedTravelerCount: namedCount,
        travelerCount: headcount,
        missingTravelerCount,
        pendingHotelCount,
        pendingTransportCount,
        missingRoomingCount,
        staleRoomingCount,
        openTaskCount: openTasks.length,
        status: needsAction ? "attention" : needsReview ? "review" : "recorded-clear",
    };
};

const getDepartureReadinessQuery = (now = new Date()) => getUpcomingDepartureQuery(now);

module.exports = { PAGE_SIZE, getDepartureReadinessQuery, summarizeDepartureReadiness };
