const mongoose = require("mongoose");

const rateFields = {
    service: { type: String, required: true, trim: true, maxlength: 160 },
    serviceKey: { type: String, required: true, select: false },
    unit: { type: String, enum: ["Room per night", "Person per night", "Day", "Trip", "Person", "Vehicle per day", "Other"], required: true },
    mealPlan: { type: String, enum: ["Room Only", "Bed & Breakfast", "Half Board", "Full Board", "All Inclusive", "Other", ""], default: "" },
    occupancy: { type: Number, min: 1, max: 10, default: null },
    amount: { type: Number, required: true, min: 0.01, max: 1000000000 },
    currency: { type: String, enum: ["USD", "LKR", "EUR", "GBP"], required: true },
    validFrom: { type: Date, required: true },
    validTo: { type: Date, required: true },
    sourceReference: { type: String, required: true, trim: true, maxlength: 160 },
    notes: { type: String, trim: true, maxlength: 500, default: "" },
    status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
};

const revisionSchema = new mongoose.Schema({
    revision: { type: Number, required: true, min: 1 },
    service: rateFields.service,
    unit: rateFields.unit,
    mealPlan: rateFields.mealPlan,
    occupancy: rateFields.occupancy,
    amount: rateFields.amount,
    currency: rateFields.currency,
    validFrom: rateFields.validFrom,
    validTo: rateFields.validTo,
    sourceReference: rateFields.sourceReference,
    notes: rateFields.notes,
    status: rateFields.status,
    changedAt: { type: Date, required: true },
    changedByName: { type: String, required: true, maxlength: 100 },
}, { _id: false });

const supplierRateSchema = new mongoose.Schema({
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier", required: true },
    ...rateFields,
    revision: { type: Number, default: 1, min: 1 },
    history: { type: [revisionSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
}, { timestamps: true, optimisticConcurrency: true });

supplierRateSchema.index({ supplier: 1, status: 1, validFrom: -1, _id: -1 });
supplierRateSchema.index({ supplier: 1, serviceKey: 1, unit: 1, mealPlan: 1, occupancy: 1, currency: 1, validFrom: 1, validTo: 1 });

module.exports = mongoose.model("SupplierRate", supplierRateSchema);
