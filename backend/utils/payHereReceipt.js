// A PayHere receipt represents one confirmed guest transaction, regardless of
// which booking it was entered against. Refunds may reuse an original reference.
const payHereReceiptKey = ({ paymentMethod, status, referenceNumber }) => {
    if (paymentMethod !== "PayHere" || status !== "Received") return null;
    return String(referenceNumber || "").trim().normalize("NFKC").toUpperCase();
};

module.exports = { payHereReceiptKey };
