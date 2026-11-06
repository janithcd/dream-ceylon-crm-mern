const { getBusinessDayBounds } = require("./businessDate");

const DAY_MS = 24 * 60 * 60 * 1000;
const STATUSES = Object.freeze(["needs-review", "all", "Received", "Disputed", "Approved", "voided"]);
const DUE_FILTERS = Object.freeze(["all", "due7", "overdue", "later", "unscheduled"]);
const unpaid = { $lt: [{ $ifNull: ["$costEntry.paidAmount", 0] }, "$costEntry.amount"] };

const parseSupplierInvoiceRegisterQuery = (params = {}, now = new Date()) => {
    const status = params.status ?? "needs-review";
    const due = params.due ?? "all";
    const rawPage = params.page ?? "1";
    if (!STATUSES.includes(status) || !DUE_FILTERS.includes(due) ||
        !["string", "number"].includes(typeof rawPage) || !/^[1-9]\d*$/.test(String(rawPage)) || Number(rawPage) > 1000) {
        return { error: "Choose a valid invoice status, due date filter, and page (1–1000)." };
    }
    if (status === "voided" && due !== "all") return { error: "Voided invoices have no active due reminders. Choose All dates." };
    const { start } = getBusinessDayBounds(now);
    return { value: { status, due, page: Number(rawPage), start, nextWeek: new Date(start.getTime() + 7 * DAY_MS) } };
};

// Explicit projection first: aggregation does not honor the model's select:false
// on binary data, hash, and internal fields.
const invoiceFields = { cost: 1, booking: 1, supplierName: 1, invoiceReference: 1,
    invoiceDate: 1, dueDate: 1, amount: 1, currency: 1, status: 1, filename: 1,
    createdAt: 1, voidedAt: 1 };

const buildSupplierInvoiceRegisterPipeline = ({ status, due, page, start, nextWeek }) => {
    const match = status === "voided" ? { voidedAt: { $ne: null } } : {
        voidedAt: null,
        ...(status === "needs-review" ? { status: { $in: ["Received", "Disputed"] } } :
            status === "all" ? {} : { status }),
    };
    if (due !== "all") {
        match.voidedAt = null;
        match.$expr = unpaid;
        match.dueDate = {
            due7: { $ne: null, $lt: nextWeek },
            overdue: { $ne: null, $lt: start },
            later: { $gte: nextWeek },
            unscheduled: null,
        }[due];
    }
    const dueOnUnpaidCost = (before, after = null) => ({ $and: [unpaid, { $ne: ["$dueDate", null] },
        { $lt: ["$dueDate", before] }, ...(after ? [{ $gte: ["$dueDate", after] }] : [])] });
    return [
        { $project: invoiceFields },
        { $lookup: { from: "costentries", localField: "cost", foreignField: "_id", as: "costEntry",
            pipeline: [{ $project: { recordType: 1, recordId: 1, description: 1, amount: 1, currency: 1,
                paidAmount: 1, paymentDueDate: 1 } }] } },
        { $unwind: "$costEntry" },
        { $match: { "costEntry.recordType": "Booking", $expr: { $eq: ["$booking", "$costEntry.recordId"] } } },
        { $lookup: { from: "bookings", localField: "booking", foreignField: "_id", as: "bookingEntry",
            pipeline: [{ $project: { bookingCode: 1, bookingStatus: 1 } }] } },
        { $unwind: "$bookingEntry" },
        { $facet: {
            items: [
                { $match: match },
                { $addFields: { undated: { $cond: [{ $eq: ["$dueDate", null] }, 1, 0] } } },
                { $sort: { undated: 1, dueDate: 1, createdAt: -1, _id: -1 } },
                { $skip: (page - 1) * 25 }, { $limit: 25 },
                { $project: { _id: 1, costId: "$cost", bookingId: "$booking", bookingCode: "$bookingEntry.bookingCode",
                    bookingStatus: "$bookingEntry.bookingStatus", supplierName: 1, invoiceReference: 1,
                    invoiceDate: 1, dueDate: 1, amount: 1, currency: 1, status: 1, filename: 1, voidedAt: 1,
                    costDescription: "$costEntry.description", costAmount: "$costEntry.amount",
                    costCurrency: "$costEntry.currency", costPaymentDueDate: "$costEntry.paymentDueDate",
                    costRemaining: { $round: [{ $subtract: ["$costEntry.amount", { $ifNull: ["$costEntry.paidAmount", 0] }] }, 2] } } },
            ],
            count: [{ $match: match }, { $count: "total" }],
            summary: [
                { $match: { voidedAt: null } },
                { $group: { _id: null,
                    needsReview: { $sum: { $cond: [{ $in: ["$status", ["Received", "Disputed"]] }, 1, 0] } },
                    overdue: { $sum: { $cond: [dueOnUnpaidCost(start), 1, 0] } },
                    dueSoon: { $sum: { $cond: [dueOnUnpaidCost(nextWeek, start), 1, 0] } },
                } },
                { $project: { _id: 0, needsReview: 1, overdue: 1, dueSoon: 1 } },
            ],
        } },
    ];
};

module.exports = { STATUSES, DUE_FILTERS, parseSupplierInvoiceRegisterQuery, buildSupplierInvoiceRegisterPipeline };
