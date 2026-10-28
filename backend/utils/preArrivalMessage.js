const { formatDocumentDate } = require("./documentDate");
const { getBusinessDayBounds } = require("./businessDate");

const oneLine = (value) => String(value || "").replace(/\s+/gu, " ").trim();
const dateValue = (value) => {
    const date = new Date(value);
    return value && !Number.isNaN(date.getTime()) ? date.getTime() : null;
};

// Select only guest-facing fields. Supplier notes, payment details and private
// booking fields must never be copied into a message sent outside the CRM.
const buildPreArrivalMessage = (booking, company = {}, now = new Date()) => {
    if (booking.bookingStatus !== "Confirmed") {
        return { error: "Confirm the booking before preparing a pre-arrival message" };
    }
    const start = dateValue(booking.travelStartDate);
    const end = dateValue(booking.travelEndDate);
    if (start === null || end === null || end < start) {
        return { error: "Save valid trip dates before preparing a pre-arrival message" };
    }
    if (start < getBusinessDayBounds(now).start.getTime()) {
        return { error: "Pre-arrival messages are available only before the trip starts" };
    }

    const guestName = oneLine(booking.customer?.fullName) || "there";
    const bookingCode = oneLine(booking.bookingCode);
    const companyName = oneLine(company.companyName) || "Dream Ceylon Journeys";
    const reviewItems = [];
    const lines = [
        `Hello ${guestName}, greetings from ${companyName}!`,
        "",
        `We are looking forward to your Sri Lanka trip${bookingCode ? ` (booking ${bookingCode})` : ""}. Your trip is scheduled from ${formatDocumentDate(booking.travelStartDate)} to ${formatDocumentDate(booking.travelEndDate)}.`,
    ];

    const stays = (booking.hotelStays || []).filter((stay) =>
        dateValue(stay.checkInDate) !== null && dateValue(stay.checkOutDate) !== null &&
        dateValue(stay.checkInDate) <= start && start < dateValue(stay.checkOutDate));
    const confirmedStays = stays.filter((stay) => stay.status === "Confirmed");
    if (confirmedStays.length === 1 && oneLine(confirmedStays[0].hotelName)) {
        const stay = confirmedStays[0];
        lines.push("", `Your first confirmed stay is ${oneLine(stay.hotelName)}${oneLine(stay.location) ? ` in ${oneLine(stay.location)}` : ""}, checking in on ${formatDocumentDate(stay.checkInDate)}.`);
    } else if (confirmedStays.length > 1) {
        reviewItems.push("Multiple first-night hotels are confirmed; choose the correct stay before sharing it.");
    } else if (confirmedStays.length === 1) {
        reviewItems.push("The confirmed first-night hotel is missing its name; review the stay before sharing it.");
    } else {
        reviewItems.push("No confirmed first-night hotel is recorded; check whether accommodation is part of the booking.");
    }
    if (stays.some((stay) => stay.status === "Requested")) {
        reviewItems.push("A first-night hotel request is still awaiting confirmation.");
    }

    const arrivalTransfers = (booking.transportAssignments || []).filter((item) =>
        item.flight?.direction === "Arrival" && dateValue(item.flight.date) === start);
    const confirmedTransfers = arrivalTransfers.filter((item) => item.status === "Confirmed");
    if (confirmedTransfers.length === 1 && oneLine(confirmedTransfers[0].flight.number)) {
        lines.push("", `Your arrival transfer for flight ${oneLine(confirmedTransfers[0].flight.number)} is confirmed. We will share the pickup details separately.`);
    } else if (confirmedTransfers.length > 1) {
        reviewItems.push("Multiple arrival transfers match the trip start; verify which one to mention.");
    } else if (confirmedTransfers.length === 1) {
        reviewItems.push("The confirmed arrival transfer is missing its flight number; review it before sharing.");
    } else {
        reviewItems.push("No confirmed arrival transfer matches the trip start; check whether a transfer is included.");
    }
    if (arrivalTransfers.some((item) => item.status === "Requested")) {
        reviewItems.push("An arrival transfer request is still awaiting confirmation.");
    }

    lines.push("", "Please keep your travel documents handy and let us know if your arrival plans change.");
    if (oneLine(company.whatsapp)) lines.push(`If you need us, message ${oneLine(company.whatsapp)}.`);
    lines.push("We look forward to welcoming you!");

    return { value: {
        bookingCode,
        guestName,
        number: oneLine(booking.customer?.whatsappNumber),
        message: lines.join("\n"),
        reviewItems,
    } };
};

module.exports = { buildPreArrivalMessage };
