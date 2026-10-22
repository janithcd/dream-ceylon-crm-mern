import { formatCalendarDate, toCalendarDateInput } from "./calendarDate.js";

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value)
    ? value.map(text).filter(Boolean).join("\n")
    : text(value);
const number = (value) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};
const display = (value) => value || "Not set";
const date = (value) => toCalendarDateInput(value);
const dateDisplay = (value) => date(value) ? formatCalendarDate(value) : "Not set";
const money = (value, currency) => currency + " " + number(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const row = (label, previous, current, normalize = text, format = display) => ({
    label,
    before: format(previous),
    after: format(current),
    changed: normalize(previous) !== normalize(current),
});

const amountRow = (label, source, revision, selector) => ({
    label,
    before: money(selector(source), source.currency || "USD"),
    after: money(selector(revision), revision.currency || "USD"),
    changed: number(selector(source)) !== number(selector(revision)) ||
        source.currency !== revision.currency,
});

// Compare the current saved records. A source quotation can still be edited after a revision.
export const buildQuotationComparison = (source, revision) => [
    {
        title: "Offer and travel",
        rows: [
            row("Client", source.clientName, revision.clientName),
            row("Tour", source.tourTitle, revision.tourTitle),
            row("Travel start", source.travelStartDate, revision.travelStartDate, date, dateDisplay),
            row("Travel end", source.travelEndDate, revision.travelEndDate, date, dateDisplay),
            row("Travelers", source.travelers, revision.travelers, number, (value) => String(number(value))),
            row("Duration (days)", source.durationDays, revision.durationDays, number, (value) => String(number(value))),
            row("Offer valid until", source.validUntil, revision.validUntil, date, dateDisplay),
            row("Status", source.status, revision.status),
            row("Currency", source.currency, revision.currency),
        ],
    },
    {
        title: "Transport and price",
        rows: [
            row("Vehicle", source.vehicleType, revision.vehicleType),
            row("Vehicle days", source.vehicleDays, revision.vehicleDays, number, (value) => String(number(value))),
            amountRow("Daily vehicle rate", source, revision, (quote) => quote.vehicleDailyRate),
            amountRow("Vehicle total", source, revision, (quote) => quote.totals?.vehicleTotal),
            amountRow("Hotels", source, revision, (quote) => quote.totals?.hotelTotal),
            amountRow("Activities", source, revision, (quote) => quote.totals?.activitiesTotal),
            amountRow("Entrance fees", source, revision, (quote) => quote.totals?.entranceFeesTotal),
            amountRow("Other", source, revision, (quote) => quote.totals?.otherTotal),
            amountRow("Discount", source, revision, (quote) => quote.totals?.discount),
            amountRow("Grand total", source, revision, (quote) => quote.totals?.grandTotal),
            amountRow("Advance requested", source, revision, (quote) => quote.totals?.advancePayment),
            amountRow("Balance", source, revision, (quote) => quote.totals?.balancePayment),
        ],
    },
    {
        title: "Offer terms",
        rows: [
            row("Inclusions", source.inclusions, revision.inclusions, list, (value) => display(list(value))),
            row("Exclusions", source.exclusions, revision.exclusions, list, (value) => display(list(value))),
            row("Notes", source.notes, revision.notes),
        ],
    },
];
