import { formatCalendarDate, toCalendarDateInput, todayCalendarDate } from "./calendarDate.js";
import { getGuestPaymentMilestones } from "./guestPaymentMilestones.js";

const supportedCurrencies = new Set(["USD", "LKR", "EUR", "GBP"]);

export const buildPaymentReminderMessage = (booking, now = new Date()) => {
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
    const money = (amount) => amount.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    const stages = getGuestPaymentMilestones(booking);
    const finalDue = toCalendarDateInput(booking.paymentDueDate);
    const next = finalDue && finalDue <= todayCalendarDate(now)
        ? stages.at(-1)
        : stages.find((stage) => stage.outstanding > 0);
    const dueDate = toCalendarDateInput(next?.dueDate)
        ? ` Our records show a payment due date of ${formatCalendarDate(next.dueDate)}.`
        : "";
    const request = next?.label === "Hotel advance"
        ? `The hotel advance to arrange for booking ${code} is ${currency} ${money(next.outstanding)}.${dueDate} The total remaining booking balance is ${currency} ${money(total - paid)}.`
        : `The remaining balance for booking ${code} is ${currency} ${money(total - paid)}.${dueDate}`;

    return `Hello ${name}, this is Dream Ceylon Journeys. I hope you are well. ${request} Please let us know once payment has been arranged, or if you need any help. Thank you!`;
};
