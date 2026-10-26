const { formatDocumentDate } = require("./documentDate");

const display = (value) => String(value || "-").trim() || "-";
const byDate = (field) => (left, right) =>
    (left[field] ? new Date(left[field]).getTime() : Infinity) -
    (right[field] ? new Date(right[field]).getTime() : Infinity);

// Select only dispatch information. Private notes and financial fields never enter the PDF renderer.
const buildOperationsBrief = (booking) => {
    const itinerary = [...(booking.itineraryDays || [])].sort(byDate("date"));
    const hotelStays = (booking.hotelStays || [])
        .filter((stay) => stay.status !== "Cancelled")
        .sort(byDate("checkInDate"));
    const transport = (booking.transportAssignments || [])
        .filter((item) => item.status !== "Cancelled")
        .sort(byDate("startDate"));
    const openTasks = (booking.preparationTasks || [])
        .filter((task) => !task.completedAt)
        .sort(byDate("dueDate"));
    const travelerNames = (booking.travelerNames || []).filter((name) => typeof name === "string" && name.trim());

    return {
        bookingCode: display(booking.bookingCode),
        bookingStatus: display(booking.bookingStatus),
        guest: [
            `Guest: ${display(booking.customer?.fullName)}`,
            `WhatsApp: ${display(booking.customer?.whatsappNumber)}`,
            `Travel dates: ${formatDocumentDate(booking.travelStartDate)} to ${formatDocumentDate(booking.travelEndDate)}`,
            `Travelers: ${display(booking.numberOfTravelers)} | Country: ${display(booking.customer?.country)}`,
        ],
        sections: [
            {
                title: "Named travelers",
                empty: "No traveler names recorded. Verify the roster before departure.",
                notice: travelerNames.length && travelerNames.length !== booking.numberOfTravelers
                    ? `${travelerNames.length} of ${display(booking.numberOfTravelers)} names saved. Confirm the remaining travelers before departure.`
                    : "",
                items: travelerNames.map((name) => ({ title: name, lines: [] })),
            },
            ...(itinerary.length ? [{
                title: "Daily itinerary",
                items: itinerary.map((day) => ({
                    title: `${formatDocumentDate(day.date)} - ${display(day.title)}`,
                    lines: [
                        ...(day.plan ? [`Plan: ${day.plan}`] : []),
                        ...(day.overnightLocation ? [`Overnight: ${day.overnightLocation}`] : []),
                    ],
                })),
            }] : []),
            {
                title: "Accommodation",
                empty: "No hotel stays recorded. Confirm whether this is a transport-only booking.",
                items: hotelStays.map((stay) => ({
                    title: `${display(stay.hotelName)}${stay.location ? ` - ${stay.location}` : ""}`,
                    lines: [
                        `${formatDocumentDate(stay.checkInDate)} to ${formatDocumentDate(stay.checkOutDate)} | ${display(stay.status)}`,
                        `${display(stay.rooms)} room(s) | ${display(stay.roomType)} | ${display(stay.mealPlan)}`,
                        `Hotel confirmation: ${display(stay.confirmationNumber)}`,
                    ],
                })),
            },
            {
                title: "Transport",
                empty: "No transport recorded. Check the travel arrangements.",
                items: transport.map((item) => ({
                    title: display(item.route),
                    lines: [
                        `${formatDocumentDate(item.startDate)} to ${formatDocumentDate(item.endDate)} | ${display(item.status)}${item.pickupTime ? ` | Pickup ${item.pickupTime}` : ""}`,
                        `Pickup: ${display(item.pickupLocation)} | Drop-off: ${display(item.dropoffLocation)}`,
                        `Vehicle: ${display(item.vehicleDescription)} | Registration: ${display(item.registration)}`,
                        `Chauffeur: ${display(item.chauffeurName)} | Phone: ${display(item.chauffeurPhone)}`,
                        ...(item.flight ? [
                            item.flight.direction + " flight: " + display(item.flight.number) + " | Scheduled: " +
                                formatDocumentDate(item.flight.date) + " " + (item.flight.time || "Time to confirm") + " (Sri Lanka, UTC+05:30)",
                            ...(item.flight.airport ? ["Airport: " + item.flight.airport] : []),
                            ...(item.flight.terminal ? ["Terminal: " + item.flight.terminal] : []),
                        ] : []),
                    ],
                })),
            },
            {
                title: "Open preparation tasks",
                empty: "No open preparation tasks.",
                items: openTasks.map((task) => ({
                    title: display(task.title),
                    lines: [
                        `Due: ${formatDocumentDate(task.dueDate)} | Priority: ${display(task.priority)} | Owner: ${display(task.assignedTo?.name)}`,
                    ],
                })),
            },
        ],
    };
};

module.exports = { buildOperationsBrief };
