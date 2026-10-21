const { getBusinessDayBounds } = require("./businessDate");

const text = (value) => String(value || "").trim();
const calendarDay = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : getBusinessDayBounds(date).start.getTime();
};

// Select only details that may be shared with a guest or hotel. In particular,
// booking-wide traveler counts are not a room allocation for split-group stays.
const buildHotelVoucher = (booking, stay, issuedAt = new Date()) => {
    if (booking.bookingStatus === "Cancelled") {
        return { error: "Cancelled bookings cannot have a hotel voucher" };
    }
    if (stay.status !== "Confirmed") {
        return { error: "Confirm this hotel stay before downloading its voucher" };
    }
    const checkIn = calendarDay(stay.checkInDate);
    const checkOut = calendarDay(stay.checkOutDate);
    if (checkIn === null || checkOut === null || checkOut <= checkIn) {
        return { error: "Save valid check-in and check-out dates before downloading the voucher" };
    }
    if (!text(stay.hotelName) || !Number.isInteger(stay.rooms) || stay.rooms < 1) {
        return { error: "Save the hotel name and number of rooms before downloading the voucher" };
    }

    return { value: {
        bookingCode: text(booking.bookingCode),
        guestName: text(booking.customer?.fullName),
        hotelName: text(stay.hotelName),
        location: text(stay.location),
        checkInDate: stay.checkInDate,
        checkOutDate: stay.checkOutDate,
        nights: (checkOut - checkIn) / (24 * 60 * 60 * 1000),
        rooms: stay.rooms,
        roomType: text(stay.roomType),
        mealPlan: text(stay.mealPlan),
        confirmationNumber: text(stay.confirmationNumber),
        issuedAt,
    } };
};

module.exports = { buildHotelVoucher };
