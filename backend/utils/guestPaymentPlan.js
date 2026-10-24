const { parseCalendarDate } = require("./paymentDueDate");

const validMoney = (value) => typeof value === "number" && Number.isFinite(value) &&
    value >= 0 && Math.abs(value * 100 - Math.round(value * 100)) < 0.000001;

// The hotel advance is a guest collection target in the booking currency, not a supplier payment.
const parseGuestPaymentPlan = ({ amount, dueDate, totalPrice, balanceDueDate }) => {
    if (!validMoney(amount) || amount > totalPrice + 0.000001) {
        return { error: "Hotel advance must be an amount in the booking currency, with at most two decimals, no greater than the total price." };
    }
    const parsed = dueDate instanceof Date
        ? { value: dueDate }
        : parseCalendarDate(dueDate, "Hotel advance due date");
    if (parsed.error) return parsed;
    if (amount > 0 && !parsed.value) {
        return { error: "Set a due date for the hotel advance." };
    }
    if (amount === 0 && parsed.value) {
        return { error: "Clear the hotel advance due date when the amount is zero." };
    }
    if (parsed.value && balanceDueDate && parsed.value > balanceDueDate) {
        return { error: "The hotel advance must be due on or before the final balance." };
    }
    return { value: { hotelAdvanceAmount: amount, hotelAdvanceDueDate: parsed.value } };
};

module.exports = { parseGuestPaymentPlan };
