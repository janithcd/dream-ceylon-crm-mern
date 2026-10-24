const test = require("node:test");
const assert = require("node:assert/strict");
const { parseReportDateRange, emptySummary, buildCurrencySummaries, buildMonthlyStats } = require("../utils/paymentReportSummary");

test("report totals preserve currency and keep refunds and cancelled entries separate", () => {
    const summaries = buildCurrencySummaries([
        { currency: "USD", status: "Received", amount: 100 },
        { currency: "LKR", status: "Received", amount: 5000 },
        { currency: "USD", status: "Refunded", amount: 30 },
        { currency: "USD", status: "Cancelled", amount: 20 },
    ]);
    assert.deepEqual(summaries, [
        { ...emptySummary("LKR"), totalPayments: 1, receivedCount: 1, totalReceived: 5000, netIncome: 5000 },
        { ...emptySummary("USD"), totalPayments: 3, receivedCount: 1, refundedCount: 1,
            cancelledCount: 1, totalReceived: 100, totalRefunded: 30, totalCancelled: 20, netIncome: 70 },
    ]);
});

test("month grouping and date filters use Sri Lanka calendar days across UTC boundaries", () => {
    const [lastYear, thisYear] = buildMonthlyStats([
        { paymentDate: "2026-01-01T18:29:59.999Z", status: "Received", amount: 10 },
        { paymentDate: "2026-01-01T18:30:00.000Z", status: "Refunded", amount: 3 },
        { paymentDate: "2025-12-31T18:29:59.999Z", status: "Received", amount: 2 },
    ]);
    assert.equal(lastYear.key, "2025-12");
    assert.equal(lastYear.received, 2);
    assert.equal(thisYear.key, "2026-01");
    assert.equal(thisYear.net, 7);
    const range = parseReportDateRange({ dateFrom: "2026-01-02", dateTo: "2026-01-02" }).value;
    assert.equal(range.from.toISOString(), "2026-01-01T18:30:00.000Z");
    assert.equal(range.toExclusive.toISOString(), "2026-01-02T18:30:00.000Z");
});

test("report rejects malformed dates and reversed ranges", () => {
    for (const dates of [{ dateFrom: "2026-02-30" }, { dateTo: "2026-13-01" },
        { dateFrom: "2026-03-01", dateTo: "2026-02-28" }, { dateFrom: ["2026-02-01"] }]) {
        assert.ok(parseReportDateRange(dates).error);
    }
    assert.deepEqual(parseReportDateRange().value, { from: null, toExclusive: null });
});
