const oneLine = (value) => String(value || "").replace(/\s+/gu, " ").trim();

// This draft is deliberately separate from the contact record: opening a message never marks it sent.
const buildPostTripMessage = (booking, company = {}) => {
    const guest = oneLine(booking.customer?.fullName) || "there";
    const business = oneLine(company.companyName) || "Dream Ceylon Journeys";
    const code = oneLine(booking.bookingCode);
    return {
        number: oneLine(booking.customer?.whatsappNumber),
        message: `Hello ${guest}, thank you for traveling with ${business}${code ? ` (booking ${code})` : ""}!\n\nWe hope you enjoyed your time in Sri Lanka. We would love to hear what you enjoyed and anything we could improve. You can reply here whenever convenient.\n\nThank you again for choosing us.`,
    };
};

module.exports = { buildPostTripMessage };
