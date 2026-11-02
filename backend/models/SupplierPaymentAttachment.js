const mongoose = require("mongoose");

// Private financial files live in MongoDB, never in the public /uploads directory.
const schema = new mongoose.Schema({
    cost: { type: mongoose.Schema.Types.ObjectId, ref: "CostEntry", required: true, immutable: true },
    paymentId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
    slot: { type: Number, required: true, min: 1, max: 5, immutable: true },
    kind: { type: String, enum: ["bank-proof", "supplier-receipt"], required: true, immutable: true },
    filename: { type: String, required: true, maxlength: 150, immutable: true },
    contentType: { type: String, enum: ["application/pdf", "image/png", "image/jpeg"], required: true, immutable: true },
    size: { type: Number, min: 1, max: 5 * 1024 * 1024, required: true, immutable: true },
    sha256: { type: String, required: true, immutable: true },
    data: { type: Buffer, required: true, select: false, immutable: true },
    uploadedAt: { type: Date, default: Date.now, immutable: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true, immutable: true },
    uploadedByName: { type: String, required: true, maxlength: 100, immutable: true },
    withdrawnAt: { type: Date, default: null },
    withdrawnBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    withdrawnByName: { type: String, default: "", maxlength: 100 },
    withdrawalReason: { type: String, default: "", maxlength: 300 },
});
schema.index({ cost: 1, paymentId: 1, slot: 1 }, { unique: true, partialFilterExpression: { withdrawnAt: null } });
schema.index({ cost: 1, paymentId: 1, sha256: 1 }, { unique: true, partialFilterExpression: { withdrawnAt: null } });
schema.index({ cost: 1, paymentId: 1, uploadedAt: -1 });
module.exports = mongoose.model("SupplierPaymentAttachment", schema);
