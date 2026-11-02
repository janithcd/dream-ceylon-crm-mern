const CostEntry = require("../models/CostEntry");
const Booking = require("../models/Booking");

const paymentError = (status, message) => Object.assign(new Error(message), { status });
const validId = (value) => typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
const loadSupplierPayment = async (req) => {
    if (!validId(req.params.id) || !validId(req.params.paymentId)) throw paymentError(400, "Choose a valid supplier payment.");
    const cost = await CostEntry.findById(req.params.id);
    if (!cost) throw paymentError(404, "Cost entry not found.");
    if (cost.recordType !== "Booking") throw paymentError(400, "Only booking supplier payments support this action.");
    const payment = cost.paymentHistory.id(req.params.paymentId);
    if (!payment || payment.kind !== "payment") throw paymentError(404, "Individual supplier payment not found.");
    const booking = await Booking.findById(cost.recordId).select("bookingCode");
    if (!booking) throw paymentError(404, "Booking not found.");
    return { cost, payment, booking };
};
const supplierPaymentErrorResponse = (res, error) => {
    if (error.status) return res.status(error.status).json({ message: error.message });
    if (["VersionError", "DocumentNotFoundError"].includes(error.name) || error.code === 11000) {
        return res.status(409).json({ message: "This payment or its files changed. Reload the latest details and try again." });
    }
    console.error("Supplier payment update failed:", error.message);
    return res.status(500).json({ message: "Could not update the supplier payment record." });
};
module.exports = { paymentError, validId, loadSupplierPayment, supplierPaymentErrorResponse };
