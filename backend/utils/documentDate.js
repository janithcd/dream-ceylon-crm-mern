// Business document dates must not depend on the host machine's timezone.
// CRM date inputs are YYYY-MM-DD; MongoDB serializes those as UTC instants.
const DOCUMENT_TIME_ZONE = "Asia/Colombo";
const formatDocumentDate = (value, { month = "short", fallback = "-" } = {}) => {
    if (!value) return fallback;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return fallback;
    return date.toLocaleDateString("en-US", {
        timeZone: DOCUMENT_TIME_ZONE, year: "numeric", month, day: "numeric",
    });
};
module.exports = { DOCUMENT_TIME_ZONE, formatDocumentDate };
