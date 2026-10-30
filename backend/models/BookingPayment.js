const mongoose = require("mongoose");
const { PAYMENT_METHODS } = require("../utils/paymentMethods");

const reconciliationEventSchema = new mongoose.Schema({
    action: { type: String, enum: ["reconciled", "reopened"], required: true },
    statementReference: { type: String, trim: true, maxlength: 100, default: "" },
    reason: { type: String, trim: true, maxlength: 300, default: "" },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
    recordedByName: { type: String, trim: true, maxlength: 100, required: true },
    recordedAt: { type: Date, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    status: { type: String, required: true },
}, { _id: true });

const bookingPaymentSchema = new mongoose.Schema(
    {
        paymentNo: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },

        booking: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Booking",
            required: true,
        },

        amount: {
            type: Number,
            required: true,
            min: 0,
        },

        currency: {
            type: String,
            enum: ["USD", "LKR", "EUR", "GBP"],
            default: "USD",
        },

        paymentDate: {
            type: Date,
            default: Date.now,
        },

        paymentType: {
            type: String,
            enum: ["Advance", "Partial Payment", "Final Payment", "Refund", "Other"],
            default: "Partial Payment",
        },

        paymentMethod: {
            type: String,
            enum: PAYMENT_METHODS,
            default: "Bank Transfer",
        },

        status: {
            type: String,
            enum: ["Received", "Refunded", "Cancelled"],
            default: "Received",
        },

        referenceNumber: {
            type: String,
            trim: true,
            default: "",
        },

        notes: {
            type: String,
            default: "",
        },

        reconciledAt: { type: Date, default: null },
        statementReference: { type: String, trim: true, maxlength: 100, default: "" },
        reconciledBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
        reconciledByName: { type: String, trim: true, maxlength: 100, default: "" },
        reconciliationHistory: { type: [reconciliationEventSchema], default: [] },
    },
    {
        timestamps: true,
    }
);

bookingPaymentSchema.index({ paymentDate: -1, status: 1, reconciledAt: 1 });

module.exports = mongoose.model("BookingPayment", bookingPaymentSchema);
