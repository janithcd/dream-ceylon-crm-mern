const COLOMBO_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const parseDate = (value) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
};

const parseReportDateRange = ({ dateFrom, dateTo } = {}) => {
    if ((dateFrom !== undefined && dateFrom !== "" && !parseDate(dateFrom)) ||
        (dateTo !== undefined && dateTo !== "" && !parseDate(dateTo))) {
        return { error: "Enter valid from and to dates (YYYY-MM-DD)." };
    }
    const from = dateFrom ? parseDate(dateFrom) : null;
    const to = dateTo ? parseDate(dateTo) : null;
    if (from && to && from > to) return { error: "From date cannot be after to date." };
    return { value: {
        from: from ? new Date(from.getTime() - COLOMBO_OFFSET_MS) : null,
        toExclusive: to ? new Date(to.getTime() + DAY_MS - COLOMBO_OFFSET_MS) : null,
    } };
};

const emptySummary = (currency) => ({
    currency, totalPayments: 0, receivedCount: 0, refundedCount: 0, cancelledCount: 0,
    totalReceived: 0, totalRefunded: 0, totalCancelled: 0, netIncome: 0,
});

const buildCurrencySummaries = (payments) => {
    const summaries = new Map();
    for (const payment of payments) {
        const currency = payment.currency || "Unknown";
        if (!summaries.has(currency)) summaries.set(currency, emptySummary(currency));
        const summary = summaries.get(currency);
        const amount = Number.isFinite(Number(payment.amount)) ? Number(payment.amount) : 0;
        summary.totalPayments += 1;
        if (payment.status === "Received") {
            summary.receivedCount += 1;
            summary.totalReceived += amount;
            summary.netIncome += amount;
        } else if (payment.status === "Refunded") {
            summary.refundedCount += 1;
            summary.totalRefunded += amount;
            summary.netIncome -= amount;
        } else if (payment.status === "Cancelled") {
            summary.cancelledCount += 1;
            summary.totalCancelled += amount;
        }
    }
    return [...summaries.values()].sort((a, b) => a.currency.localeCompare(b.currency));
};

const monthFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Colombo", year: "numeric", month: "2-digit",
});

const buildMonthlyStats = (payments) => {
    const months = new Map();
    for (const payment of payments) {
        const date = new Date(payment.paymentDate);
        if (Number.isNaN(date.getTime())) continue;
        const parts = Object.fromEntries(monthFormatter.formatToParts(date)
            .map(({ type, value }) => [type, value]));
        const year = Number(parts.year);
        const month = Number(parts.month);
        const key = `${year}-${parts.month}`;
        if (!months.has(key)) months.set(key, {
            key, year, month,
            label: new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", {
                timeZone: "UTC", month: "short", year: "numeric",
            }),
            received: 0, refunded: 0, cancelled: 0, net: 0, count: 0,
        });
        const row = months.get(key);
        const amount = Number.isFinite(Number(payment.amount)) ? Number(payment.amount) : 0;
        row.count += 1;
        if (payment.status === "Received") { row.received += amount; row.net += amount; }
        else if (payment.status === "Refunded") { row.refunded += amount; row.net -= amount; }
        else if (payment.status === "Cancelled") row.cancelled += amount;
    }
    return [...months.values()].sort((a, b) => a.key.localeCompare(b.key));
};

module.exports = { parseReportDateRange, emptySummary, buildCurrencySummaries, buildMonthlyStats };
