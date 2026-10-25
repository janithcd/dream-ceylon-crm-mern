const cents = (amount) => Math.round(Number(amount) * 100);

const validatePaymentEntry = ({ amount, paymentType, status }) => {
    if (!Number.isFinite(amount) || amount <= 0 ||
        Math.abs(amount * 100 - cents(amount)) > 0.000001) {
        return "Enter an amount greater than zero with at most two decimals.";
    }
    if ((status === "Refunded" && paymentType !== "Refund") ||
        (paymentType === "Refund" && status === "Received")) {
        return "A refund must have type Refund and status Refunded. Cancelled entries do not affect the balance.";
    }
    return null;
};

const netReceivedCents = (payments, currency) => payments.reduce((sum, payment) => {
    if (payment.currency !== currency) return sum;
    if (payment.status === "Received") return sum + cents(payment.amount);
    if (payment.status === "Refunded") return sum - cents(payment.amount);
    return sum;
}, 0);

// Existing negative balances from older records can be corrected, but must not be made worse.
const validateProjectedBalance = (payments, currency, paymentToRemove, paymentToAdd) => {
    const current = netReceivedCents(payments, currency);
    const projected = netReceivedCents([
        ...payments.filter((payment) => String(payment._id) !== String(paymentToRemove?._id)),
        ...(paymentToAdd ? [paymentToAdd] : []),
    ], currency);
    if (projected < Math.min(0, current)) {
        return `Refunds would exceed recorded receipts. Available to refund: ${currency} ${Math.max(current, 0) / 100}.`;
    }
    return null;
};

module.exports = { validatePaymentEntry, netReceivedCents, validateProjectedBalance };
