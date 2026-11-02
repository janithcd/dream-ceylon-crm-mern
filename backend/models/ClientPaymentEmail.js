const mongoose = require("mongoose");

const clientPaymentEmailSchema = new mongoose.Schema({
    booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: "BookingPayment", required: true, unique: true },
    recipient: { type: String, required: true, trim: true, lowercase: true },
    status: { type: String, enum: ["Pending", "Sent", "Rejected", "Unknown"], required: true },
    providerRequestId: { type: String, default: "" },
    paymentCents: { type: Number, required: true },
    chargeCents: { type: Number, required: true },
    balanceCents: { type: Number, required: true },
    sentAt: { type: Date, default: null },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
}, { timestamps: true });

module.exports = mongoose.model("ClientPaymentEmail", clientPaymentEmailSchema);
