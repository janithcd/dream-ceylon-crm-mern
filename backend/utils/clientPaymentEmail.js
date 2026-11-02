const { createHash } = require("node:crypto");
const { formatDocumentDate } = require("./documentDate");
const { paymentDocumentIssue } = require("../controllers/paymentReceiptPdfController");

const money = (cents, currency) => `${currency} ${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
})}`;

const cleanLine = (value) => String(value || "").replace(/[\r\n\t\x00-\x1f]+/g, " ").trim();
const validEmail = (value) => typeof value === "string" && value.length <= 254 &&
    /^[^\s@,;<>]{1,64}@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value);

const parseCharge = (value) => {
    if (typeof value !== "string" || !/^\d{1,9}(?:\.\d{1,2})?$/.test(value)) return null;
    const [whole, fraction = ""] = value.split(".");
    return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
};

const prepareClientPaymentEmail = ({ booking, payment, statement, chargedAmount }) => {
    if (!booking || !payment || !statement || String(payment.booking) !== String(booking._id)) {
        return { status: 404, message: "Payment not found for this booking." };
    }
    if (payment.status !== "Received") {
        return { status: 409, message: "Only received payments can be confirmed by email." };
    }
    const issue = paymentDocumentIssue({ ...payment, booking });
    if (issue) return { status: 409, message: issue };
    const to = cleanLine(booking.customer?.email).toLowerCase();
    if (!validEmail(to)) return { status: 409, message: "Add a valid guest email to the booking before sending." };

    const amountCents = Math.round(Number(payment.amount) * 100);
    const isCard = payment.paymentMethod === "PayHere";
    let chargeCents = amountCents;
    if (isCard) {
        if (chargedAmount === undefined || chargedAmount === "") {
            return { ready: false, to, paymentNo: cleanLine(payment.paymentNo),
                amountCents, currency: statement.currency,
                message: "Enter the verified total charged by PayHere, including any fee, to preview the email." };
        }
        chargeCents = parseCharge(chargedAmount);
        if (chargeCents === null || chargeCents < amountCents || chargeCents > amountCents * 1.2) {
            return { status: 400, message: "Enter the actual PayHere charge in the booking currency (payment plus any processing fee)." };
        }
    }
    const feeCents = chargeCents - amountCents;
    const bookingCode = cleanLine(statement.bookingCode).slice(0, 80);
    const firstName = cleanLine(statement.guestName).split(/\s+/)[0].slice(0, 80) || "Guest";
    const subject = `Payment confirmation | ${bookingCode} | Dream Ceylon Journeys`;
    const lines = [
        `Dear ${firstName},`, "",
        `Thank you for your payment of ${money(amountCents, statement.currency)} toward booking ${bookingCode}.`,
        `The tour price is ${money(statement.totalCents, statement.currency)}. Your total payments received, less any refunds, are ${money(statement.netPaidCents, statement.currency)}, leaving ${money(statement.balanceCents, statement.currency)} to pay.`,
    ];
    if (isCard) {
        lines.push("", feeCents > 0
            ? `The total PayHere card charge was ${money(chargeCents, statement.currency)}. This includes ${money(amountCents, statement.currency)} applied to your tour and a separate ${money(feeCents, statement.currency)} processing fee. The fee is not part of the tour price or remaining balance.`
            : `The total PayHere card charge was ${money(chargeCents, statement.currency)}, all applied to your tour.`);
    }
    if (statement.balanceCents > 0 && statement.finalDueDate) {
        lines.push("", `The remaining balance is due ${formatDocumentDate(statement.finalDueDate)}.`);
    }
    lines.push("", "Attached are your payment receipt and current guest payment statement for your records.",
        "", "Kind regards,", "Dream Ceylon Journeys");
    const textbody = lines.join("\n");
    const safePaymentNo = cleanLine(payment.paymentNo).replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 80);
    const safeCode = bookingCode.replace(/[^a-zA-Z0-9-]/g, "-");
    const attachments = [
        `dream-ceylon-payment-receipt-${safePaymentNo}.pdf`,
        `dream-ceylon-payment-statement-${safeCode}.pdf`,
    ];
    const fingerprint = createHash("sha256").update(JSON.stringify({
        paymentId: String(payment._id), bookingId: String(booking._id), to, subject, textbody,
        chargedAmount: chargeCents, paymentDate: new Date(payment.paymentDate).toISOString(),
        paymentReference: payment.referenceNumber, rows: statement.rows,
        bookingStatus: statement.bookingStatus, attachments,
    })).digest("hex");
    return { ready: true, to, subject, textbody, attachments, fingerprint,
        amountCents, chargeCents, feeCents, balanceCents: statement.balanceCents,
        currency: statement.currency, paymentNo: cleanLine(payment.paymentNo) };
};

module.exports = { prepareClientPaymentEmail, parseCharge };
