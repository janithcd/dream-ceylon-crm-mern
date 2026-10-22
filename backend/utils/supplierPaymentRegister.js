const { getBusinessDayBounds } = require("./businessDate");

const DAY_MS = 24 * 60 * 60 * 1000;
const COLOMBO_OFFSET_MS = 330 * 60 * 1000;
const MAX_EXPORT_ROWS = 10000;

const parseDate = (value) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
};

const parseSupplierPaymentRegisterQuery = (params = {}, now = new Date()) => {
    const today = new Date(getBusinessDayBounds(now).start.getTime() + COLOMBO_OFFSET_MS)
        .toISOString().slice(0, 10);
    const from = params.from ?? `${today.slice(0, 7)}-01`;
    const to = params.to ?? today;
    const start = parseDate(from);
    const end = parseDate(to);
    if (!start || !end || end < start || end.getTime() - start.getTime() >= 366 * DAY_MS) {
        return { error: "Choose valid from and to dates within a 366-day range." };
    }
    const rawPage = params.page ?? "1";
    const rawLimit = params.limit ?? "25";
    if (!["string", "number"].includes(typeof rawPage) || !["string", "number"].includes(typeof rawLimit) ||
        !/^[1-9]\d*$/.test(String(rawPage)) || !/^[1-9]\d*$/.test(String(rawLimit)) ||
        Number(rawPage) > 1000 || Number(rawLimit) > 50) {
        return { error: "Page must be 1–1000 and limit must be 1–50." };
    }
    const reference = params.reference ?? "";
    if (typeof reference !== "string" || reference.trim().length > 100) {
        return { error: "Payment reference must be at most 100 characters." };
    }
    const escaped = reference.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const paymentMatch = {
        "paymentHistory.kind": "payment",
        "paymentHistory.paymentDate": { $gte: start, $lt: new Date(end.getTime() + DAY_MS) },
        ...(escaped ? { "paymentHistory.reference": { $regex: escaped, $options: "i" } } : {}),
    };
    return { value: {
        from, to, reference: reference.trim(), page: Number(rawPage), limit: Number(rawLimit),
        stages: [
            { $match: { recordType: "Booking", paymentHistory: { $elemMatch: {
                kind: "payment", paymentDate: paymentMatch["paymentHistory.paymentDate"],
                ...(escaped ? { reference: paymentMatch["paymentHistory.reference"] } : {}),
            } } } },
            { $unwind: "$paymentHistory" },
            { $match: paymentMatch },
            { $lookup: { from: "bookings", localField: "recordId", foreignField: "_id", as: "booking" } },
            { $unwind: "$booking" },
        ],
    } };
};

const registerSort = { "paymentHistory.paymentDate": -1, "paymentHistory.recordedAt": -1, _id: -1, "paymentHistory._id": -1 };
const registerProject = {
    _id: 0, paymentId: "$paymentHistory._id", costId: "$_id", recordId: 1,
    bookingCode: "$booking.bookingCode", customerName: "$booking.customer.fullName",
    description: 1, currency: 1, amount: "$paymentHistory.amount",
    paymentDate: "$paymentHistory.paymentDate", method: "$paymentHistory.method",
    reference: "$paymentHistory.reference", note: "$paymentHistory.note",
    recordedByName: "$paymentHistory.recordedByName", recordedAt: "$paymentHistory.recordedAt",
};

const csvCell = (value) => {
    const raw = value === null || value === undefined ? "" : String(value);
    const safe = /^[\s]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, '""')}"`;
};

const supplierPaymentsCsv = (items) => {
    const headers = ["Payment date", "Booking", "Customer", "Supplier / cost", "Currency", "Amount", "Method", "Reference", "Note", "Recorded by", "Recorded at (UTC)"];
    const rows = items.map((item) => [
        item.paymentDate?.toISOString().slice(0, 10), item.bookingCode, item.customerName,
        item.description, item.currency, Number(item.amount).toFixed(2), item.method,
        item.reference, item.note, item.recordedByName, item.recordedAt?.toISOString(),
    ]);
    return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
};

module.exports = { MAX_EXPORT_ROWS, parseSupplierPaymentRegisterQuery, registerSort, registerProject, supplierPaymentsCsv };
