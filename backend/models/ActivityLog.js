const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema(
    {
        action: {
            type: String,
            enum: [
                "CREATE",
                "UPDATE",
                "DELETE",
                "LOGIN",
                "LOGOUT",
                "DOWNLOAD",
                "GENERATE",
                "CONVERT",
                "COMPLETE",
                "CANCEL",
                "REFUND",
                "RESTORE",
                "OTHER",
            ],
            required: true,
            index: true,
        },

        module: {
            type: String,
            enum: [
                "Authentication",
                "Inquiry",
                "Quotation",
                "Booking",
                "Payment",
                "Follow-Up",
                "Customer",
                "Destination",
                "Package",
                "Vehicle",
                "Settings",
                "PDF",
                "Admin",
                "System",
                "Other",
            ],
            required: true,
            index: true,
        },

        description: {
            type: String,
            required: true,
            trim: true,
        },

        admin: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
            default: null,
            index: true,
        },

        adminName: {
            type: String,
            trim: true,
            default: "",
        },

        adminEmail: {
            type: String,
            trim: true,
            lowercase: true,
            default: "",
        },

        relatedRecordId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
            index: true,
        },

        relatedModel: {
            type: String,
            trim: true,
            default: "",
        },

        referenceNo: {
            type: String,
            trim: true,
            default: "",
            index: true,
        },

        customerName: {
            type: String,
            trim: true,
            default: "",
            index: true,
        },

        ipAddress: {
            type: String,
            trim: true,
            default: "",
        },

        userAgent: {
            type: String,
            trim: true,
            default: "",
        },

        requestMethod: {
            type: String,
            trim: true,
            uppercase: true,
            default: "",
        },

        requestPath: {
            type: String,
            trim: true,
            default: "",
        },

        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },

        status: {
            type: String,
            enum: ["Success", "Failed"],
            default: "Success",
            index: true,
        },
    },
    {
        timestamps: true,
    }
);

activityLogSchema.index({
    description: "text",
    customerName: "text",
    referenceNo: "text",
    adminName: "text",
    adminEmail: "text",
});

activityLogSchema.index({
    createdAt: -1,
});

activityLogSchema.index({
    module: 1,
    action: 1,
    createdAt: -1,
});

module.exports = mongoose.model("ActivityLog", activityLogSchema);