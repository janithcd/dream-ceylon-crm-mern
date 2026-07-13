const mongoose = require("mongoose");

const followUpSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
        },

        type: {
            type: String,
            enum: [
                "General",
                "Inquiry",
                "Quotation",
                "Booking",
                "Payment",
                "Client Call",
                "WhatsApp",
                "Email",
            ],
            default: "General",
        },

        inquiry: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Inquiry",
            default: null,
        },

        quotation: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Quotation",
            default: null,
        },

        booking: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Booking",
            default: null,
        },

        customerName: {
            type: String,
            trim: true,
            default: "",
        },

        customerContact: {
            type: String,
            trim: true,
            default: "",
        },

        followUpDate: {
            type: Date,
            required: true,
        },

        priority: {
            type: String,
            enum: ["Low", "Medium", "High", "Urgent"],
            default: "Medium",
        },

        status: {
            type: String,
            enum: ["Pending", "Completed", "Cancelled"],
            default: "Pending",
        },

        notes: {
            type: String,
            default: "",
        },

        completedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("FollowUp", followUpSchema);