const cents = (value) => {
    const amount = Number(value || 0);
    return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
};

// Recorded net payments cover the hotel advance first; refunds can reopen it.
export const getGuestPaymentMilestones = (booking) => {
    const total = Math.max(cents(booking?.totalPrice), 0);
    const paid = Math.min(Math.max(cents(booking?.advancePayment), 0), total);
    const target = Math.min(Math.max(cents(booking?.hotelAdvanceAmount), 0), total);
    const advanceRemaining = Math.max(target - paid, 0);
    const balanceRemaining = Math.max(total - Math.max(paid, target), 0);
    const stages = [];
    if (target > 0) stages.push({
        label: "Hotel advance",
        target: target / 100,
        outstanding: advanceRemaining / 100,
        dueDate: booking?.hotelAdvanceDueDate || null,
    });
    stages.push({
        label: "Final balance",
        target: (total - target) / 100,
        outstanding: balanceRemaining / 100,
        dueDate: booking?.paymentDueDate || null,
    });
    return stages;
};
