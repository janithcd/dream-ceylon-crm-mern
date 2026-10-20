const { getBusinessDayBounds } = require("./businessDate");
const { parseCalendarDate } = require("./paymentDueDate");
const { ACTIVE_BOOKING_STATUSES } = require("./myTasks");

const PAGE_SIZE = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

const parseTransferFilters = (query = {}, now = new Date()) => {
    const today = getBusinessDayBounds(now).end.toISOString().slice(0, 10);
    const startDate = query.startDate === undefined ? today : query.startDate;
    const start = parseCalendarDate(startDate, "Pickup start date");
    if (start.error || !start.value) return { error: start.error || "Pickup start date is required" };
    const endDate = query.endDate === undefined
        ? new Date(start.value.getTime() + 6 * DAY_MS).toISOString().slice(0, 10)
        : query.endDate;
    const end = parseCalendarDate(endDate, "Pickup end date");
    if (end.error || !end.value) return { error: end.error || "Pickup end date is required" };
    const span = (end.value - start.value) / DAY_MS;
    if (span < 0 || span > 30) return { error: "Choose a pickup date range of 1 to 31 days" };

    const direction = query.direction === undefined ? "all" : query.direction;
    const status = query.status === undefined ? "all" : query.status;
    const chauffeur = query.chauffeur === undefined ? "all" : query.chauffeur;
    if (!["all", "Arrival", "Departure"].includes(direction)) return { error: "Invalid flight direction" };
    if (!["all", "Requested", "Confirmed"].includes(status)) return { error: "Invalid transfer status" };
    if (!["all", "missing"].includes(chauffeur)) return { error: "Invalid chauffeur filter" };
    const page = query.page === undefined ? 1 : Number(query.page);
    if ((query.page !== undefined && (typeof query.page !== "string" || !/^\d+$/.test(query.page)))
        || !Number.isSafeInteger(page) || page < 1 || page > 10000) {
        return { error: "Page must be a whole number from 1 to 10000" };
    }
    return { value: { startDate, endDate, direction, status, chauffeur, page } };
};

const buildAirportTransfersPipeline = ({ startDate, endDate, direction, status, chauffeur, page }) => {
    const assignmentMatch = {
        startDate: {
            $gte: getBusinessDayBounds(new Date(startDate)).start,
            $lte: getBusinessDayBounds(new Date(endDate)).end,
        },
        status: status === "all" ? { $in: ["Requested", "Confirmed"] } : status,
        "flight.direction": direction === "all" ? { $in: ["Arrival", "Departure"] } : direction,
    };
    const missingChauffeur = { $eq: [{ $trim: { input: { $ifNull: ["$chauffeurName", ""] } } }, ""] };
    const countIf = (condition) => ({ $sum: { $cond: [condition, 1, 0] } });

    return [
        { $match: {
            bookingStatus: { $in: ACTIVE_BOOKING_STATUSES },
            transportAssignments: { $elemMatch: assignmentMatch },
        } },
        { $unwind: "$transportAssignments" },
        { $match: Object.fromEntries(Object.entries(assignmentMatch).map(([key, value]) => ["transportAssignments." + key, value])) },
        { $project: {
            _id: "$transportAssignments._id",
            bookingId: "$_id",
            bookingCode: 1,
            bookingStatus: 1,
            customerName: "$customer.fullName",
            numberOfTravelers: 1,
            travelStartDate: 1,
            travelEndDate: 1,
            route: "$transportAssignments.route",
            pickupDate: "$transportAssignments.startDate",
            pickupTime: { $ifNull: ["$transportAssignments.pickupTime", ""] },
            pickupLocation: "$transportAssignments.pickupLocation",
            dropoffLocation: "$transportAssignments.dropoffLocation",
            vehicleDescription: "$transportAssignments.vehicleDescription",
            registration: "$transportAssignments.registration",
            chauffeurName: "$transportAssignments.chauffeurName",
            chauffeurPhone: "$transportAssignments.chauffeurPhone",
            status: "$transportAssignments.status",
            flight: {
                direction: "$transportAssignments.flight.direction",
                number: "$transportAssignments.flight.number",
                date: "$transportAssignments.flight.date",
                time: "$transportAssignments.flight.time",
                airport: "$transportAssignments.flight.airport",
                terminal: "$transportAssignments.flight.terminal",
            },
        } },
        { $addFields: { missingChauffeur } },
        ...(chauffeur === "missing" ? [{ $match: { missingChauffeur: true } }] : []),
        { $facet: {
            summary: [{ $group: {
                _id: null,
                requested: countIf({ $eq: ["$status", "Requested"] }),
                missingChauffeur: countIf("$missingChauffeur"),
                missingPickupTime: countIf({ $eq: ["$pickupTime", ""] }),
            } }],
            total: [{ $count: "value" }],
            items: [
                { $addFields: { sortPickupTime: { $cond: [{ $eq: ["$pickupTime", ""] }, "99:99", "$pickupTime"] } } },
                { $sort: { pickupDate: 1, sortPickupTime: 1, bookingCode: 1, bookingId: 1, _id: 1 } },
                { $skip: (page - 1) * PAGE_SIZE },
                { $limit: PAGE_SIZE },
                { $project: { sortPickupTime: 0 } },
            ],
        } },
    ];
};

module.exports = { parseTransferFilters, buildAirportTransfersPipeline, PAGE_SIZE };
