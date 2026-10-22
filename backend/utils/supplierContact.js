const { parseCalendarDate } = require("./paymentDueDate");
const { getBusinessDayBounds } = require("./businessDate");

const CONTACT_CHANNELS = ["Email", "WhatsApp", "Phone", "Other"];
const SERVICE_FIELDS = {
    hotel: { field: "hotelStays", title: "hotelName", serviceDate: "checkInDate" },
    transport: { field: "transportAssignments", title: "route", serviceDate: "startDate" },
};

const parseSupplierContact = (body, serviceDate, now = new Date()) => {
    if (!CONTACT_CHANNELS.includes(body?.channel)) return { error: "Choose a contact channel" };
    if (body?.note !== undefined && (typeof body.note !== "string" || body.note.trim().length > 300)) {
        return { error: "Contact note must be text of at most 300 characters" };
    }
    if (!Object.hasOwn(body, "nextFollowUpDate")) {
        return { error: "Choose a next follow-up date or clear the reminder" };
    }
    const parsed = parseCalendarDate(body.nextFollowUpDate, "Next follow-up date");
    if (parsed.error) return parsed;
    const next = parsed.value;
    if (next) {
        const { start: nextDay } = getBusinessDayBounds(next);
        const { start: today } = getBusinessDayBounds(now);
        const service = new Date(serviceDate);
        if (Number.isNaN(service.getTime()) || nextDay < today || nextDay > getBusinessDayBounds(service).start) {
            return { error: "Next follow-up must be today or later and on or before the service date (Sri Lanka time)" };
        }
    }
    return { value: { channel: body.channel, note: (body.note || "").trim(), nextFollowUpDate: next } };
};

const presentSupplierContacts = (booking, item, type) => ({
    bookingCode: booking.bookingCode,
    bookingStatus: booking.bookingStatus,
    type,
    title: item[SERVICE_FIELDS[type].title],
    status: item.status,
    serviceDate: item[SERVICE_FIELDS[type].serviceDate],
    followUpDate: item.followUpDate || null,
    contacts: [...(item.contacts || [])].reverse().map((entry) => ({
        id: entry._id,
        contactedAt: entry.contactedAt,
        contactedBy: entry.contactedByName || "Staff member",
        channel: entry.channel,
        note: entry.note || "",
        nextFollowUpDate: entry.nextFollowUpDate || null,
    })),
});

module.exports = { CONTACT_CHANNELS, SERVICE_FIELDS, parseSupplierContact, presentSupplierContacts };
