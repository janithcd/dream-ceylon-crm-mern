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

        assignedTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
            default: null,
        },

        firstContactAt: { type: Date, default: null },
        firstContactChannel: {
            type: String,
            enum: ["Email", "WhatsApp", "Phone", "Other"],
            default: null,
        },
        firstContactBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
            default: null,
        },

        lossReason: {
            type: String,
            enum: ["Budget", "Travel plans changed", "No response", "Booked elsewhere", "Dates unavailable", "Other"],
            default: null,
        },

        lossNote: {
            type: String,
            trim: true,
            maxlength: 300,
            default: "",
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

inquirySchema.index({ status: 1, assignedTo: 1, createdAt: 1 });
inquirySchema.index({ email: 1 });

const Inquiry = mongoose.model("Inquiry", inquirySchema);

module.exports = Inquiry;
