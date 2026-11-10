const { parseCalendarDate } = require("./paymentDueDate");
const { getBusinessDayBounds } = require("./businessDate");
const { ACTIVE_BOOKING_STATUSES } = require("./myTasks");

const PAGE_SIZE = 20;
const FILTERS = ["all", "attention", "requested", "confirmed", "missingDriver", "missingVehicle", "missingPickup"];
const DAY_MS = 24 * 60 * 60 * 1000;

const parseTransportDispatchFilters = (query = {}, now = new Date()) => {
    const today = getBusinessDayBounds(now).end.toISOString().slice(0, 10);
    const from = query.from === undefined ? today : query.from;
    const start = parseCalendarDate(from, "From date");
    if (start.error || !start.value) return { error: "Choose valid from and through dates" };
    const to = query.to === undefined ? new Date(start.value.getTime() + 6 * DAY_MS).toISOString().slice(0, 10) : query.to;
    const end = parseCalendarDate(to, "Through date");
    if (end.error || !end.value) return { error: "Choose valid from and through dates" };
    if (end.value < start.value || (end.value - start.value) / DAY_MS > 30) return { error: "Choose a range of 1 to 31 days" };
    const filter = query.filter === undefined ? "all" : query.filter;
    if (typeof filter !== "string" || !FILTERS.includes(filter)) return { error: "Choose a valid dispatch filter" };
    const page = query.page === undefined ? 1 : Number(query.page);
    if ((query.page !== undefined && (typeof query.page !== "string" || !/^\d+$/.test(query.page))) ||
        !Number.isSafeInteger(page) || page < 1 || page > 10000) return { error: "Page must be a whole number from 1 to 10000" };
    return { value: { from, to, filter, page } };
};

const buildTransportDispatchPipeline = ({ from, to, filter = "all", page = 1 }) => {
    const start = getBusinessDayBounds(new Date(`${from}T00:00:00Z`)).start;
    const end = getBusinessDayBounds(new Date(`${to}T00:00:00Z`)).end;
    const serviceMatch = { status: { $in: ["Requested", "Confirmed"] }, startDate: { $lte: end }, endDate: { $gte: start } };
    const blank = (field) => ({ $eq: [{ $trim: { input: { $ifNull: [`$${field}`, ""] } } }, ""] });
    const confirmed = { $eq: ["$status", "Confirmed"] };
    const countIf = (condition) => ({ $sum: { $cond: [condition, 1, 0] } });
    const match = {
        requested: { status: "Requested" }, confirmed: { status: "Confirmed" },
        attention: { needsAttention: true }, missingDriver: { missingDriver: true },
        missingVehicle: { missingVehicle: true }, missingPickup: { missingPickup: true },
    }[filter];
    const selected = match ? [{ $match: match }] : [];

    return [
        { $match: { bookingStatus: { $in: ACTIVE_BOOKING_STATUSES }, transportAssignments: { $elemMatch: serviceMatch } } },
        { $unwind: "$transportAssignments" },
        { $match: Object.fromEntries(Object.entries(serviceMatch).map(([key, value]) => [`transportAssignments.${key}`, value])) },
        { $project: {
            _id: "$transportAssignments._id", bookingId: "$_id", bookingCode: 1, bookingStatus: 1,
            customerName: "$customer.fullName", travelStartDate: 1, travelEndDate: 1,
            route: "$transportAssignments.route", status: "$transportAssignments.status",
            startDate: "$transportAssignments.startDate", endDate: "$transportAssignments.endDate",
            pickupTime: "$transportAssignments.pickupTime", pickupLocation: "$transportAssignments.pickupLocation",
            dropoffLocation: "$transportAssignments.dropoffLocation", vehicleDescription: "$transportAssignments.vehicleDescription",
            registration: "$transportAssignments.registration", chauffeurName: "$transportAssignments.chauffeurName",
            chauffeurPhone: "$transportAssignments.chauffeurPhone",
        } },
        { $addFields: {
            missingDriver: { $and: [confirmed, { $or: [blank("chauffeurName"), blank("chauffeurPhone")] }] },
            missingVehicle: { $and: [confirmed, blank("registration")] },
            missingPickup: { $and: [confirmed, { $or: [blank("pickupTime"), blank("pickupLocation")] }] },
        } },
        { $addFields: { needsAttention: { $or: [
            { $eq: ["$status", "Requested"] }, "$missingDriver", "$missingVehicle", "$missingPickup",
        ] } } },
        { $facet: {
            summary: [{ $group: {
                _id: null, total: { $sum: 1 }, requested: countIf({ $eq: ["$status", "Requested"] }),
                attention: countIf("$needsAttention"), missingDriver: countIf("$missingDriver"),
                missingVehicle: countIf("$missingVehicle"), missingPickup: countIf("$missingPickup"),
            } }],
            total: [...selected, { $count: "value" }],
            items: [
                ...selected,
                { $addFields: { sortTime: { $cond: [blank("pickupTime"), "99:99", "$pickupTime"] } } },
                { $sort: { startDate: 1, sortTime: 1, bookingCode: 1, bookingId: 1, _id: 1 } },
                { $skip: (page - 1) * PAGE_SIZE }, { $limit: PAGE_SIZE },
                { $project: { sortTime: 0 } },
            ],
        } },
    ];
};

module.exports = { parseTransportDispatchFilters, buildTransportDispatchPipeline, PAGE_SIZE, FILTERS };
