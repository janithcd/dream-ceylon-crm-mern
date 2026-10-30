const { getBusinessDayBounds } = require("./businessDate");
const { PAYMENT_METHODS } = require("./paymentMethods");

const DAY_MS = 24 * 60 * 60 * 1000;
const COLOMBO_OFFSET_MS = 330 * 60 * 1000;

const parseDate = (value) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
};

const parseRegisterQuery = (params = {}, now = new Date()) => {
    const today = new Date(getBusinessDayBounds(now).start.getTime() + COLOMBO_OFFSET_MS)
        .toISOString().slice(0, 10);
    const from = params.from ?? `${today.slice(0, 7)}-01`;
    const to = params.to ?? today;
    const start = parseDate(from);
    const end = parseDate(to);
    if (!start || !end || end < start || end.getTime() - start.getTime() >= 366 * DAY_MS) {
        return { error: "Choose valid from and to dates within a 366-day range." };
    }
    const page = params.page ?? "1";
    if (!["string", "number"].includes(typeof page) || !/^[1-9]\d*$/.test(String(page)) || Number(page) > 1000) {
        return { error: "Page must be between 1 and 1000." };
    }
    const status = params.status ?? "all";
    if (!["all", "unreconciled", "reconciled"].includes(status)) {
        return { error: "Choose all, unreconciled, or reconciled payments." };
    }
    const paymentMethod = params.paymentMethod ?? "";
    if (typeof paymentMethod !== "string" ||
        (paymentMethod !== "" && !PAYMENT_METHODS.includes(paymentMethod))) {
        return { error: "Choose a valid payment method." };
    }
    const reference = params.reference ?? "";
    if (typeof reference !== "string" || reference.trim().length > 100) {
        return { error: "Payment reference must be at most 100 characters." };
    }
    const escaped = reference.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return { value: {
        from, to, page: Number(page), status, paymentMethod, reference: reference.trim(),
        query: {
            status: { $in: ["Received", "Refunded"] },
            ...(paymentMethod ? { paymentMethod } : {}),
            paymentDate: {
                $gte: new Date(start.getTime() - COLOMBO_OFFSET_MS),
                $lt: new Date(end.getTime() + DAY_MS - COLOMBO_OFFSET_MS),
            },
            ...(status === "all" ? {} : { reconciledAt: status === "reconciled" ? { $ne: null } : null }),
            ...(escaped ? { $or: [
                { referenceNumber: { $regex: escaped, $options: "i" } },
                { statementReference: { $regex: escaped, $options: "i" } },
                { paymentNo: { $regex: escaped, $options: "i" } },
            ] } : {}),
        },
    } };
};

const parseReconciliation = (body) => {
    if (body?.reconciled === true) {
        const reference = body.statementReference;
        if (typeof reference !== "string" || !reference.trim() || reference.trim().length > 100) {
            return { error: "Enter the statement or cashbook reference (1–100 characters)." };
        }
        return { value: { reconciled: true, statementReference: reference.trim() } };
    }
    if (body?.reconciled === false) {
        const reason = body.reason;
        if (typeof reason !== "string" || reason.trim().length < 3 || reason.trim().length > 300) {
            return { error: "Explain why this match was reopened (3–300 characters)." };
        }
        return { value: { reconciled: false, reason: reason.trim() } };
    }
    return { error: "Choose whether to match or reopen this payment." };
};

const csvCell = (value) => {
    const raw = value === null || value === undefined ? "" : String(value);
    const safe = /^[\s]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, '""')}"`;
};

const sriLankaDate = (value) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(value).map(({ type, value: part }) => [type, part]));
    return `${parts.year}-${parts.month}-${parts.day}`;
};

const guestPaymentsCsv = (payments) => {
    const headers = ["Payment date (Sri Lanka)", "Payment no", "Booking", "Customer", "Status",
        "Currency", "Amount", "Method", "Payment reference", "Matching status",
        "Statement reference", "Matched by", "Matched at (UTC)", "Booking currency", "Currency review"];
    const rows = payments.map((item) => [
        sriLankaDate(item.paymentDate), item.paymentNo, item.booking?.bookingCode,
        item.booking?.customer?.fullName, item.status, item.currency,
        Number(item.amount).toFixed(2), item.paymentMethod, item.referenceNumber,
        item.reconciledAt ? "Matched" : "To match", item.statementReference,
        item.reconciledByName, item.reconciledAt?.toISOString(), item.booking?.currency,
        item.booking?.currency === item.currency ? "Aligned" : "Review",
    ]);
    return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
};

module.exports = { parseRegisterQuery, parseReconciliation, guestPaymentsCsv };
