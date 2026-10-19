import { formatCalendarDate, toCalendarDateInput } from "./calendarDate.js";

const supportedCurrencies = new Set(["USD", "LKR", "EUR", "GBP"]);

export const buildPaymentReminderMessage = (booking) => {
    const total = Number(booking?.totalPrice);
    const paid = Number(booking?.advancePayment ?? 0);
    const code = typeof booking?.bookingCode === "string" ? booking.bookingCode.trim() : "";
    const currency = booking?.currency;
    if (!code || !supportedCurrencies.has(currency) || !Number.isFinite(total) ||
        !Number.isFinite(paid) || total <= 0 || paid < 0 || total - paid < 0.005 ||
        booking?.bookingStatus === "Cancelled") return "";

    const name = typeof booking.customer?.fullName === "string"
        ? booking.customer.fullName.trim().replace(/\s+/g, " ") || "there"
        : "there";
    const balance = (total - paid).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    const dueDate = toCalendarDateInput(booking.paymentDueDate)
        ? ` Our records show a payment due date of ${formatCalendarDate(booking.paymentDueDate)}.`
        : "";

    return `Hello ${name}, this is Dream Ceylon Journeys. I hope you are well. The remaining balance for booking ${code} is ${currency} ${balance}.${dueDate} Please let us know once payment has been arranged, or if you need any help. Thank you!`;
};
