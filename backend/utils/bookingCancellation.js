const normalizeReason = (reason) => typeof reason === "string"
    ? reason.trim().replace(/\s+/g, " ") : "";

const planBookingCancellation = ({ currentStatus = null, nextStatus, reason, admin, now = new Date() }) => {
    if (currentStatus === nextStatus) return { event: null, fields: {} };
    if (nextStatus === "Cancelled") {
        const cancellationReason = normalizeReason(reason);
        if (cancellationReason.length < 10 || cancellationReason.length > 300) {
            return { error: "Enter a cancellation reason of 10–300 characters." };
        }
        return { event: "cancelled", fields: {
            cancellationReason, cancelledAt: now,
            cancelledBy: admin?._id || null,
            cancelledByName: String(admin?.name || "").trim().slice(0, 120),
        } };
    }
    if (currentStatus === "Cancelled") {
        return { event: "reopened", fields: {
            cancellationReason: "", cancelledAt: null, cancelledBy: null, cancelledByName: "",
        } };
    }
    return { event: null, fields: {} };
};

module.exports = { planBookingCancellation, normalizeReason };
