const { getBusinessDayBounds } = require("./businessDate");
const { ACTIVE_BOOKING_STATUSES } = require("./myTasks");

const DAY_MS = 24 * 60 * 60 * 1000;
const FILTERS = ["due7", "overdue", "later", "all"];
const PAGE_SIZE = 25;

const buildHotelDeadlinePipeline = ({ filter = "due7", page = 1 } = {}, now = new Date()) => {
    const { start } = getBusinessDayBounds(now);
    const nextWeek = new Date(start.getTime() + 7 * DAY_MS);
    const selected = {
        due7: { cancellationDeadline: { $lt: nextWeek } },
        overdue: { cancellationDeadline: { $lt: start } },
        later: { cancellationDeadline: { $gte: nextWeek } },
        all: {},
    }[filter];
    return [
        { $match: {
            bookingStatus: { $in: ACTIVE_BOOKING_STATUSES },
            hotelStays: { $elemMatch: {
                status: { $in: ["Requested", "Confirmed"] },
                cancellationDeadline: { $ne: null }, checkInDate: { $gte: start },
            } },
        } },
        { $unwind: "$hotelStays" },
        { $match: {
            "hotelStays.status": { $in: ["Requested", "Confirmed"] },
            "hotelStays.cancellationDeadline": { $ne: null },
            "hotelStays.checkInDate": { $gte: start },
        } },
        { $project: {
            _id: "$hotelStays._id", bookingId: "$_id", bookingCode: 1,
            customerName: "$customer.fullName", hotelName: "$hotelStays.hotelName",
            location: "$hotelStays.location", status: "$hotelStays.status",
            checkInDate: "$hotelStays.checkInDate", checkOutDate: "$hotelStays.checkOutDate",
            cancellationDeadline: "$hotelStays.cancellationDeadline",
            cancellationTerms: "$hotelStays.cancellationTerms",
        } },
        { $facet: {
            summary: [{ $group: {
                _id: null, total: { $sum: 1 },
                overdue: { $sum: { $cond: [{ $lt: ["$cancellationDeadline", start] }, 1, 0] } },
                dueSoon: { $sum: { $cond: [{ $and: [
                    { $gte: ["$cancellationDeadline", start] }, { $lt: ["$cancellationDeadline", nextWeek] },
                ] }, 1, 0] } },
                later: { $sum: { $cond: [{ $gte: ["$cancellationDeadline", nextWeek] }, 1, 0] } },
            } }],
            total: [{ $match: selected }, { $count: "value" }],
            items: [
                { $match: selected },
                { $sort: { cancellationDeadline: 1, checkInDate: 1, bookingCode: 1, _id: 1 } },
                { $skip: (page - 1) * PAGE_SIZE }, { $limit: PAGE_SIZE },
            ],
        } },
    ];
};

module.exports = { FILTERS, PAGE_SIZE, buildHotelDeadlinePipeline };
