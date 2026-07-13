const mongoose = require("mongoose");

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
            enum: ["Cash", "Bank Transfer", "Card", "Online Payment", "Other"],
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
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("BookingPayment", bookingPaymentSchema);