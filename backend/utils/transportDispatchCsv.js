const csvCell = (value) => {
    const raw = value == null ? "" : String(value);
    const safe = /^[\s]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, '""')}"`;
};

const day = (value) => value instanceof Date ? value.toISOString().slice(0, 10) :
    typeof value === "string" ? value.slice(0, 10) : "";

const dispatchCsv = (items) => {
    const headers = ["Service from", "Service through", "Pickup time (Sri Lanka)", "Booking", "Guest", "Route", "Status",
        "Vehicle", "Registration", "Chauffeur", "Chauffeur phone", "Pickup location", "Drop-off location", "Attention", "Overlapping confirmed bookings"];
    const rows = items.map((item) => {
        const attention = [
            item.status === "Requested" && "Awaiting confirmation",
            item.vehicleConflict && "Possible vehicle clash",
            item.missingDriver && "Driver details",
            item.missingVehicle && "Registration review",
            item.missingPickup && "Pickup details",
        ].filter(Boolean).join("; ");
        const refs = [...new Set((item.vehicleConflicts || []).map((match) => match.bookingCode))].join("; ");
        return [day(item.startDate), day(item.endDate), item.pickupTime, item.bookingCode, item.customerName,
            item.route, item.status, item.vehicleDescription, item.registration, item.chauffeurName,
            item.chauffeurPhone, item.pickupLocation, item.dropoffLocation, attention, refs];
    });
    return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
};

module.exports = { dispatchCsv };
