const mongoose = require("mongoose");

const inquirySchema = new mongoose.Schema(
    {
        fullName: {
            type: String,
            required: [true, "Full name is required"],
            trim: true,
        },

        email: {
            type: String,
            required: [true, "Email is required"],
            lowercase: true,
            trim: true,
        },

        whatsappNumber: {
            type: String,
            required: [true, "WhatsApp number is required"],
            trim: true,
        },

        country: {
            type: String,
            required: [true, "Country is required"],
            trim: true,
        },

        travelDate: {
            type: Date,
        },

        numberOfTravelers: {
            type: Number,
            min: 1,
            default: 1,
        },

        interestedPackage: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "TourPackage",
            default: null,
        },

        message: {
            type: String,
            required: [true, "Message is required"],
            trim: true,
        },

        status: {
            type: String,
            enum: ["New", "Contacted", "Follow Up", "Converted", "Cancelled"],
            default: "New",
        },

        priority: {
            type: String,
            enum: ["Low", "Medium", "High"],
            default: "Medium",
        },

        source: {
            type: String,
            enum: ["Website", "Facebook", "Instagram", "WhatsApp", "Referral", "Other"],
            default: "Website",
        },

        adminNotes: {
            type: String,
            default: "",
        },
    },
    {
        timestamps: true,
    }
);

const Inquiry = mongoose.model("Inquiry", inquirySchema);

module.exports = Inquiry;