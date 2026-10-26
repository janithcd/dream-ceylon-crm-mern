const { formatDocumentDate } = require("./documentDate");
const { getBusinessDayBounds } = require("./businessDate");

const oneLine = (value) => String(value || "").replace(/\s+/gu, " ").trim();
const day = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : getBusinessDayBounds(date).start.getTime();
};

// This draft is an editable request, never a statement of the hotel's policy.
const buildHotelCancellationDraft = (booking, stay, company = {}) => {
    if (booking.bookingStatus !== "Cancelled") {
        return { error: "Cancel the booking before preparing a hotel cancellation request." };
    }
    if (!["Requested", "Confirmed"].includes(stay.status)) {
        return { error: "Only open hotel stays can have a cancellation request." };
    }
    const checkInDay = day(stay.checkInDate);
    const checkOutDay = day(stay.checkOutDate);
    if (checkInDay === null || checkOutDay === null || checkOutDay <= checkInDay) {
        return { error: "Save valid check-in and check-out dates before preparing a request." };
    }
    const hotelName = oneLine(stay.hotelName);
    if (!hotelName || !Number.isInteger(stay.rooms) || stay.rooms < 1) {
        return { error: "Save the hotel name and number of rooms before preparing a request." };
    }

    const guestName = oneLine(booking.customer?.fullName);
    const bookingCode = oneLine(booking.bookingCode);
    const companyName = oneLine(company.companyName) || "Dream Ceylon Journeys";
    const hotelReference = oneLine(stay.confirmationNumber);
    const missingDetails = [];
    if (!oneLine(stay.supplierEmail)) missingDetails.push("Supplier email");
    if (!guestName) missingDetails.push("Lead guest name");
    if (stay.status === "Confirmed" && !hotelReference) missingDetails.push("Hotel confirmation reference");

    const subject = `Cancellation request | ${bookingCode || "Booking"} | ${hotelName}`.slice(0, 160);
    const body = [
        `Dear ${hotelName} reservations team,`,
        "",
        `I am writing from ${companyName} to request cancellation of the following ${stay.status === "Requested" ? "reservation request" : "reservation"}:`,
        "",
        `Our reference: ${bookingCode || "To be provided"}`,
        `Hotel confirmation reference: ${hotelReference || "Not recorded"}`,
        `Lead guest: ${guestName || "To be confirmed"}`,
        `Check-in: ${formatDocumentDate(stay.checkInDate)}`,
        `Check-out: ${formatDocumentDate(stay.checkOutDate)}`,
        `Rooms: ${stay.rooms} ${stay.rooms === 1 ? "room" : "rooms"}`,
        `Room type: ${oneLine(stay.roomType) || "Not recorded"}`,
        "",
        "Please confirm in writing that this reservation or request has been cancelled. Please advise whether any cancellation charge applies under our agreed terms, and provide the amount and basis if so.",
        "",
        "Kind regards,",
        companyName,
    ];
    if (oneLine(company.email)) body.push(oneLine(company.email));

    return { value: { bookingCode, hotelName, recipient: oneLine(stay.supplierEmail),
        subject, body: body.join("\n"), missingDetails } };
};

module.exports = { buildHotelCancellationDraft };
