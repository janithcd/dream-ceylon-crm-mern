const mongoose = require("mongoose");

const supplierSchema = new mongoose.Schema({
    category: { type: String, enum: ["Hotel", "Guide", "Safari jeep", "Transport", "Activity", "Other"], required: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    nameKey: { type: String, required: true, select: false },
    location: { type: String, trim: true, maxlength: 120, default: "" },
    locationKey: { type: String, required: true, select: false },
    contactName: { type: String, trim: true, maxlength: 120, default: "" },
    email: { type: String, trim: true, lowercase: true, maxlength: 254, default: "" },
    phone: { type: String, trim: true, maxlength: 30, default: "" },
    whatsapp: { type: String, trim: true, maxlength: 30, default: "" },
    terms: { type: String, trim: true, maxlength: 500, default: "" },
    notes: { type: String, trim: true, maxlength: 1000, default: "" },
    status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
}, { timestamps: true, optimisticConcurrency: true });

supplierSchema.index({ category: 1, nameKey: 1, locationKey: 1 }, { unique: true });
supplierSchema.index({ status: 1, category: 1, name: 1 });

module.exports = mongoose.model("Supplier", supplierSchema);
