// Select guest-facing details explicitly. Booking financials, supplier notes and
// operational assignments must never be passed to the guest PDF renderer.
const buildGuestItinerary = (booking) => ({
    bookingCode: String(booking.bookingCode || "").trim(),
    guestName: String(booking.customer?.fullName || "").trim(),
    travelStartDate: booking.travelStartDate,
    travelEndDate: booking.travelEndDate,
    numberOfTravelers: booking.numberOfTravelers,
    isDraft: booking.bookingStatus === "Pending",
    entries: [...(booking.itineraryDays || [])]
        .sort((left, right) =>
            new Date(left.date) - new Date(right.date) ||
            new Date(left.createdAt) - new Date(right.createdAt)
        )
        .map((day) => ({
            date: day.date,
            title: String(day.title || "").trim(),
            plan: String(day.plan || "").trim(),
            overnightLocation: String(day.overnightLocation || "").trim(),
        })),
});

module.exports = { buildGuestItinerary };
