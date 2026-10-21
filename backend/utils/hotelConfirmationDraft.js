const { formatDocumentDate } = require("./documentDate");
const { getBusinessDayBounds } = require("./businessDate");
const { ACTIVE_BOOKING_STATUSES } = require("./myTasks");

const oneLine = (value) => String(value || "").replace(/\s+/gu, " ").trim();
const day = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : getBusinessDayBounds(date).start.getTime();
};

// Only explicitly selected reservation details belong in a supplier email.
const buildHotelConfirmationDraft = (booking, stay, company = {}) => {
    if (!ACTIVE_BOOKING_STATUSES.includes(booking.bookingStatus)) {
        return { error: "Hotel requests are available only for active bookings" };
    }
    if (stay.status !== "Requested") {
        return { error: "Only requested hotel stays can have a confirmation request" };
    }
    const checkInDay = day(stay.checkInDate);
    const checkOutDay = day(stay.checkOutDate);
    if (checkInDay === null || checkOutDay === null || checkOutDay <= checkInDay) {
        return { error: "Save valid check-in and check-out dates before preparing a request" };
    }
    const hotelName = oneLine(stay.hotelName);
    if (!hotelName || !Number.isInteger(stay.rooms) || stay.rooms < 1) {
        return { error: "Save the hotel name and number of rooms before preparing a request" };
    }

    const guestName = oneLine(booking.customer?.fullName);
    const bookingCode = oneLine(booking.bookingCode);
    const companyName = oneLine(company.companyName) || "Dream Ceylon Journeys";
    const rooms = `${stay.rooms} ${stay.rooms === 1 ? "room" : "rooms"}`;
    const nights = (checkOutDay - checkInDay) / 86400000;
    const missingDetails = [];
    if (!oneLine(stay.supplierEmail)) missingDetails.push("Supplier email");
    if (!guestName) missingDetails.push("Lead guest name");
    if (!oneLine(stay.roomType)) missingDetails.push("Room type");

    const subject = `Reservation request | ${bookingCode || "New booking"} | ${hotelName}`.slice(0, 160);
    const body = [
        `Dear ${hotelName} reservations team,`,
        "",
        `I am writing from ${companyName} to request the following reservation. Please confirm availability and the booking reference.`,
        "",
        `Our reference: ${bookingCode || "To be provided"}`,
        `Lead guest: ${guestName || "To be confirmed"}`,
        `Check-in: ${formatDocumentDate(stay.checkInDate)}`,
        `Check-out: ${formatDocumentDate(stay.checkOutDate)}`,
        `Stay: ${nights} ${nights === 1 ? "night" : "nights"}`,
        `Rooms: ${rooms}`,
        `Room type: ${oneLine(stay.roomType) || "To be confirmed"}`,
        `Meal plan: ${oneLine(stay.mealPlan) || "To be confirmed"}`,
        "",
        "Please let us know if you need any further information. Thank you.",
        "",
        `Kind regards,`,
        companyName,
    ];
    if (oneLine(company.email)) body.push(oneLine(company.email));

    return { value: {
        bookingCode,
        hotelName,
        recipient: oneLine(stay.supplierEmail),
        subject,
        body: body.join("\n"),
        missingDetails,
    } };
};

module.exports = { buildHotelConfirmationDraft };
