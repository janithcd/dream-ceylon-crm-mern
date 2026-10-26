const { formatDocumentDate } = require("./documentDate");
const { getBusinessDayBounds } = require("./businessDate");
const { ACTIVE_BOOKING_STATUSES } = require("./myTasks");

const oneLine = (value) => String(value || "").replace(/\s+/gu, " ").trim();
const day = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : getBusinessDayBounds(date).start.getTime();
};

// A rooming draft needs the complete current party, but staff choose who stays
// at this hotel and their room groups before any names enter the supplier email.
const buildHotelRoomingDetails = (booking, stay, company = {}) => {
    if (!ACTIVE_BOOKING_STATUSES.includes(booking.bookingStatus) || stay.status !== "Confirmed") {
        return { error: "Rooming drafts require an active booking and confirmed hotel stay." };
    }
    const checkIn = day(stay.checkInDate);
    const checkOut = day(stay.checkOutDate);
    if (checkIn === null || checkOut === null || checkOut <= checkIn) {
        return { error: "Save valid hotel check-in and check-out dates before preparing a rooming draft." };
    }
    const hotelName = oneLine(stay.hotelName);
    if (!hotelName || !Number.isInteger(stay.rooms) || stay.rooms < 1 || stay.rooms > 20) {
        return { error: "Save the hotel name and room count before preparing a rooming draft." };
    }
    const names = booking.travelerNames;
    if (!Number.isInteger(booking.numberOfTravelers) || booking.numberOfTravelers < 1 ||
        !Array.isArray(names) || names.length !== booking.numberOfTravelers ||
        names.some((name) => typeof name !== "string" || !name.trim() || /[\r\n]/u.test(name))) {
        return { error: "Complete the booking's traveler roster before preparing a hotel rooming draft." };
    }
    if (stay.rooms > names.length) {
        return { error: "There are more reserved rooms than named travelers. Review the hotel room count." };
    }

    const missingDetails = [];
    if (!oneLine(stay.supplierEmail)) missingDetails.push("Supplier email");
    if (!oneLine(stay.confirmationNumber)) missingDetails.push("Hotel confirmation reference");
    if (!oneLine(stay.roomType)) missingDetails.push("Room type");
    return { value: {
        bookingCode: oneLine(booking.bookingCode),
        hotelName,
        checkIn: formatDocumentDate(stay.checkInDate),
        checkOut: formatDocumentDate(stay.checkOutDate),
        rooms: stay.rooms,
        roomType: oneLine(stay.roomType),
        mealPlan: oneLine(stay.mealPlan),
        hotelReference: oneLine(stay.confirmationNumber),
        recipient: oneLine(stay.supplierEmail),
        travelerNames: names.map(oneLine),
        companyName: oneLine(company.companyName) || "Dream Ceylon Journeys",
        companyEmail: oneLine(company.email),
        missingDetails,
    } };
};

module.exports = { buildHotelRoomingDetails };
