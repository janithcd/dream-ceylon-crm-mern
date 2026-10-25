const { getBusinessDayBounds } = require("./businessDate");

const cents = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0 ||
        Math.abs(number * 100 - Math.round(number * 100)) > 0.000001) return null;
    return Math.round(number * 100);
};

const buildGuestPaymentStatement = (booking, payments, issuedAt = new Date()) => {
    if (booking.bookingStatus === "Cancelled") {
        return { error: "A cancelled booking cannot have an outstanding payment statement." };
    }
    const total = cents(booking.totalPrice);
    const advanceTarget = cents(booking.hotelAdvanceAmount ?? 0);
    if (total === null || advanceTarget === null || advanceTarget > total) {
        return { error: "Review the booking price and hotel advance before issuing a statement." };
    }

    const rows = [];
    let received = 0;
    let refunded = 0;
    for (const payment of payments) {
        if (payment.status === "Cancelled") continue;
        if (!["Received", "Refunded"].includes(payment.status) ||
            (payment.status === "Refunded") !== (payment.paymentType === "Refund")) {
            return { error: "Review the payment type and status before issuing a statement." };
        }
        if (payment.currency !== booking.currency) {
            return { error: "Correct the different-currency payment before issuing a statement." };
        }
        const amount = cents(payment.amount);
        if (amount === null || amount === 0 || !payment.paymentDate ||
            Number.isNaN(new Date(payment.paymentDate).getTime())) {
            return { error: "Review payment amounts and dates before issuing a statement." };
        }
        if (getBusinessDayBounds(new Date(payment.paymentDate)).start > getBusinessDayBounds(issuedAt).end) {
            return { error: "Future-dated payments cannot appear on a statement issued today." };
        }
        if (payment.status === "Received") received += amount;
        else refunded += amount;
        rows.push({
            paymentNo: String(payment.paymentNo || ""),
            date: new Date(payment.paymentDate),
            kind: payment.status === "Received" ? "Receipt" : "Refund",
            method: String(payment.paymentMethod || ""),
            reference: String(payment.referenceNumber || ""),
            amountCents: amount,
        });
    }
    const netPaid = received - refunded;
    if (netPaid < 0) return { error: "Recorded refunds exceed receipts. Correct the payment history before issuing a statement." };
    const recordedPaid = cents(booking.advancePayment);
    if (recordedPaid === null || recordedPaid !== Math.min(netPaid, total || netPaid)) {
        return { error: "The booking paid amount differs from its payment history. Reconcile it before issuing a statement." };
    }

    // MongoDB supplies _id order for records on the same day; stable sort keeps it.
    rows.sort((a, b) => a.date - b.date);
    return { value: {
        bookingCode: String(booking.bookingCode || ""),
        bookingStatus: String(booking.bookingStatus || ""),
        guestName: String(booking.customer?.fullName || ""),
        travelStartDate: booking.travelStartDate,
        travelEndDate: booking.travelEndDate,
        currency: booking.currency,
        totalCents: total,
        receivedCents: received,
        refundedCents: refunded,
        netPaidCents: netPaid,
        balanceCents: Math.max(total - netPaid, 0),
        creditCents: Math.max(netPaid - total, 0),
        hotelAdvanceCents: advanceTarget,
        hotelAdvanceOutstandingCents: Math.max(advanceTarget - netPaid, 0),
        hotelAdvanceDueDate: booking.hotelAdvanceDueDate,
        finalDueDate: booking.paymentDueDate,
        issuedAt,
        rows,
    } };
};

module.exports = { buildGuestPaymentStatement };
