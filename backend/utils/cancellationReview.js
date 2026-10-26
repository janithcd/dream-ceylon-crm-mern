const FILTERS = Object.freeze(["open", "all"]);
const PAGE_SIZE = 20;

// Keep the financial lookups after pagination: the operations queue must be
// available to booking staff without reading cost or payment collections.
const buildCancellationReviewPipeline = ({ filter = "open", page = 1, includeFinance = false } = {}) => {
    const selected = filter === "open" ? { activeServiceCount: { $gt: 0 } } : {};
    const active = (field, nameField, dateField) => ({
        $map: {
            input: { $filter: {
                input: { $ifNull: [`$${field}`, []] }, as: "item",
                cond: { $in: ["$$item.status", ["Requested", "Confirmed"]] },
            } },
            as: "item", in: {
                _id: "$$item._id", name: `$$item.${nameField}`,
                status: "$$item.status", date: `$$item.${dateField}`,
                ...(field === "hotelStays" ? {
                    cancellationDeadline: "$$item.cancellationDeadline",
                    cancellationTerms: "$$item.cancellationTerms",
                } : {}),
            },
        },
    });
    const items = [
        { $match: selected },
        { $sort: { updatedAt: -1, _id: -1 } },
        { $skip: (page - 1) * PAGE_SIZE },
        { $limit: PAGE_SIZE },
    ];
    if (includeFinance) {
        items.push(
            { $lookup: {
                from: "costentries", let: { bookingId: "$_id" },
                pipeline: [
                    { $match: { recordType: "Booking", $expr: { $eq: ["$recordId", "$$bookingId"] } } },
                    { $group: {
                        _id: "$currency", recordedCost: { $sum: "$amount" },
                        recordedPaid: { $sum: { $ifNull: ["$paidAmount", 0] } },
                        recordedUnpaid: { $sum: { $max: [0, { $subtract: ["$amount", { $ifNull: ["$paidAmount", 0] }] }] } },
                    } },
                    { $project: { _id: 0, currency: "$_id", recordedCost: 1, recordedPaid: 1, recordedUnpaid: 1 } },
                ], as: "supplierCosts",
            } },
            { $lookup: {
                from: "bookingpayments", let: { bookingId: "$_id" },
                pipeline: [
                    { $match: { status: { $in: ["Received", "Refunded"] },
                        $expr: { $eq: ["$booking", "$$bookingId"] } } },
                    { $group: { _id: { currency: "$currency", status: "$status" },
                        amount: { $sum: "$amount" }, count: { $sum: 1 } } },
                    { $project: { _id: 0, currency: "$_id.currency", status: "$_id.status", amount: 1, count: 1 } },
                ], as: "guestLedger",
            } },
        );
    }
    return [
        { $match: { bookingStatus: "Cancelled" } },
        { $project: {
            bookingCode: 1, customerName: "$customer.fullName", travelStartDate: 1,
            updatedAt: 1, activeHotels: active("hotelStays", "hotelName", "checkInDate"),
            activeTransport: active("transportAssignments", "route", "startDate"),
            ...(includeFinance ? { currency: 1, bookedPaidAmount: "$advancePayment" } : {}),
        } },
        { $addFields: { activeServiceCount: { $add: [
            { $size: "$activeHotels" }, { $size: "$activeTransport" },
        ] } } },
        { $facet: {
            summary: [{ $group: { _id: null, total: { $sum: 1 },
                withActiveServices: { $sum: { $cond: [{ $gt: ["$activeServiceCount", 0] }, 1, 0] } },
            } }],
            total: [{ $match: selected }, { $count: "value" }],
            items,
        } },
    ];
};

module.exports = { FILTERS, PAGE_SIZE, buildCancellationReviewPipeline };
