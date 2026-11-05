const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema({
    status: { type: String, enum: ["Approved", "Disputed"], required: true },
    note: { type: String, trim: true, maxlength: 300, default: "" },
    reviewedAt: { type: Date, required: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
    reviewedByName: { type: String, required: true, maxlength: 100 },
}, { _id: false });

// One private pro forma/invoice record per supplier document. An incorrect
// document is voided and replaced; its metadata and file remain in history.
const schema = new mongoose.Schema({
    cost: { type: mongoose.Schema.Types.ObjectId, ref: "CostEntry", required: true, immutable: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true, immutable: true },
    supplierName: { type: String, required: true, trim: true, maxlength: 160, immutable: true },
    invoiceReference: { type: String, required: true, trim: true, maxlength: 100, immutable: true },
    referenceKey: { type: String, required: true, select: false, immutable: true },
    invoiceDate: { type: Date, required: true, immutable: true },
    dueDate: { type: Date, default: null, immutable: true },
    amount: { type: Number, required: true, min: 0.01, max: 1000000000, immutable: true },
    currency: { type: String, enum: ["USD", "LKR", "EUR", "GBP"], required: true, immutable: true },
    status: { type: String, enum: ["Received", "Approved", "Disputed"], default: "Received" },
    reviewHistory: { type: [reviewSchema], default: [] },
    filename: { type: String, default: "", maxlength: 150 },
    contentType: { type: String, enum: ["application/pdf", "image/png", "image/jpeg", ""], default: "" },
    size: { type: Number, default: 0, max: 5 * 1024 * 1024 },
    sha256: { type: String, default: "", select: false },
    data: { type: Buffer, select: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true, immutable: true },
    createdByName: { type: String, required: true, maxlength: 100, immutable: true },
    voidedAt: { type: Date, default: null },
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    voidedByName: { type: String, default: "", maxlength: 100 },
    voidReason: { type: String, default: "", maxlength: 300 },
}, { timestamps: true, optimisticConcurrency: true });

schema.index({ cost: 1, referenceKey: 1 }, { unique: true, partialFilterExpression: { voidedAt: null } });
schema.index({ booking: 1, createdAt: -1 });

module.exports = mongoose.model("SupplierInvoice", schema);
