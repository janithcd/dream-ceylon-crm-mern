const { getBusinessDayBounds } = require("./businessDate");

const cents = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0 ||
        Math.abs(number * 100 - Math.round(number * 100)) > 0.000001) return null;
    return Math.round(number * 100);
};

const buildGuestPaymentStatement = (booking, payments, issuedAt = new Date()) => {
    const issues = [];
    let firstError = "";
    const addIssue = (code, message, error, payment = null) => {
        if (!firstError) firstError = error;
        const paymentDate = payment?.paymentDate && new Date(payment.paymentDate);
        issues.push({ code, message, paymentNo: payment ? String(payment.paymentNo || "") : null,
            paymentDate: paymentDate && !Number.isNaN(paymentDate.getTime()) ? paymentDate.toISOString() : null });
    };
    if (booking.bookingStatus === "Cancelled") {
        addIssue("cancelled_booking", "This booking is cancelled. Review its status before issuing a statement.",
            "A cancelled booking cannot have an outstanding payment statement.");
    }
    const total = cents(booking.totalPrice);
    const advanceTarget = cents(booking.hotelAdvanceAmount ?? 0);
    if (total === null || advanceTarget === null || advanceTarget > total) {
        addIssue("booking_price", "Review the booking price and hotel advance target in the booking details.",
            "Review the booking price and hotel advance before issuing a statement.");
    }

    const rows = [];
    let received = 0;
    let refunded = 0;
    for (const payment of payments) {
        if (payment.status === "Cancelled") continue;
        if (!["Received", "Refunded"].includes(payment.status) ||
            (payment.status === "Refunded") !== (payment.paymentType === "Refund")) {
            addIssue("payment_direction", "Verify this receipt or refund against the bank record, then correct its type and status.",
                "Review the payment type and status before issuing a statement.", payment);
            continue;
        }
        if (payment.currency !== booking.currency) {
            addIssue("payment_currency", "Enter the verified amount in the booking currency for this payment.",
                "Correct the different-currency payment before issuing a statement.", payment);
            continue;
        }
        const amount = cents(payment.amount);
        if (amount === null || amount === 0 || !payment.paymentDate ||
            Number.isNaN(new Date(payment.paymentDate).getTime())) {
            addIssue("payment_amount_date", "Review this payment's amount and date against the original record.",
                "Review payment amounts and dates before issuing a statement.", payment);
            continue;
        }
        if (getBusinessDayBounds(new Date(payment.paymentDate)).start > getBusinessDayBounds(issuedAt).end) {
            addIssue("future_payment", "This payment date is in the future. Correct it if the money was already received or refunded.",
                "Future-dated payments cannot appear on a statement issued today.", payment);
            continue;
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
    if (issues.length) return { error: firstError, issues };
    const netPaid = received - refunded;
    if (netPaid < 0) {
        addIssue("refund_excess", "Recorded refunds exceed receipts. Check the payment history with Finance.",
            "Recorded refunds exceed receipts. Correct the payment history before issuing a statement.");
        return { error: firstError, issues };
    }
    const recordedPaid = cents(booking.advancePayment);
    if (recordedPaid === null || recordedPaid !== Math.min(netPaid, total || netPaid)) {
        addIssue("paid_mismatch", "The booking paid amount differs from the recorded payment history. Check the bank or cashbook entries and record only verified missing payments.",
            "The booking paid amount differs from its payment history. Reconcile it before issuing a statement.");
        Object.assign(issues[issues.length - 1], {
            bookedPaidCents: recordedPaid, ledgerNetCents: netPaid,
            targetPaidCents: Math.min(netPaid, total || netPaid),
            receivedCents: received, refundedCents: refunded,
        });
        return { error: firstError, issues };
    }

    // MongoDB supplies _id order for records on the same day; stable sort keeps it.
    rows.sort((a, b) => a.date - b.date);
    return { issues: [], value: {
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

const planGuestPaymentSummaryReconciliation = (booking, payments, input, now = new Date()) => {
    const reason = input?.reason;
    if (input?.confirmLedgerComplete !== true || typeof reason !== "string" ||
        reason.trim().length < 10 || reason.trim().length > 300) {
        return { status: 400, error: "Confirm that the ledger is complete and enter a reason (10–300 characters)." };
    }
    const result = buildGuestPaymentStatement(booking, payments, now);
    if (result.issues.length !== 1 || result.issues[0].code !== "paid_mismatch") {
        return { status: 409, error: result.error || "The booking paid amount already matches its payment history." };
    }
    const issue = result.issues[0];
    if (issue.bookedPaidCents === null) {
        return { status: 409, error: "Review the invalid booking paid amount with Finance before reconciling." };
    }
    if (![input.expectedBookedPaidCents, input.expectedLedgerNetCents,
        input.expectedTargetPaidCents].every(Number.isSafeInteger) ||
        input.expectedBookedPaidCents !== issue.bookedPaidCents ||
        input.expectedLedgerNetCents !== issue.ledgerNetCents ||
        input.expectedTargetPaidCents !== issue.targetPaidCents) {
        return { status: 409, error: "The booking or ledger changed. Refresh and review the totals again." };
    }
    const { receivedCents, refundedCents, ledgerNetCents, targetPaidCents } = issue;
    const totalCents = cents(booking.totalPrice);
    const paymentStatus = refundedCents > 0 && ledgerNetCents === 0 ? "Refunded" :
        totalCents > 0 && ledgerNetCents >= totalCents ? "Paid" :
            ledgerNetCents > 0 ? "Partially Paid" : "Pending";
    return { value: { reason: reason.trim(), previousPaidCents: issue.bookedPaidCents,
        targetPaidCents, ledgerNetCents, receivedCents, refundedCents,
        previousPaymentStatus: booking.paymentStatus, paymentStatus } };
};

module.exports = { buildGuestPaymentStatement, planGuestPaymentSummaryReconciliation };
