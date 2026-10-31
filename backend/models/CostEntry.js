const mongoose = require("mongoose");

const remittanceRevisionSchema = new mongoose.Schema({
    revision: { type: Number, required: true, min: 1 },
    supplierName: { type: String, required: true, maxlength: 160 },
    supplierEmail: { type: String, default: "", maxlength: 254 },
    invoiceReference: { type: String, required: true, maxlength: 80 },
    guestReference: { type: String, default: "", maxlength: 200 },
    transferAmount: { type: Number, required: true, min: 0.01, max: 1000000000 },
    transferCurrency: { type: String, enum: ["USD", "LKR", "EUR", "GBP"], required: true },
    transferReference: { type: String, default: "", maxlength: 100 },
    bookingCode: { type: String, required: true },
    paymentDate: { type: Date, required: true },
    method: { type: String, enum: ["Bank transfer", "Cash", "Card", "Other"], required: true },
    issuedAt: { type: Date, required: true },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
    recordedByName: { type: String, required: true, maxlength: 100 },
    changeReason: { type: String, default: "", maxlength: 300 },
}, { _id: false });

const reconciliationEventSchema = new mongoose.Schema({
    action: { type: String, enum: ["reconciled", "reopened"], required: true },
    statementReference: { type: String, trim: true, maxlength: 100, default: "" },
    reason: { type: String, trim: true, maxlength: 300, default: "" },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
    recordedByName: { type: String, trim: true, maxlength: 100, required: true },
    recordedAt: { type: Date, default: Date.now },
});

const paymentHistorySchema = new mongoose.Schema({
    kind: { type: String, enum: ["payment", "adjustment"], required: true },
    amount: { type: Number, required: true }, // Signed change in the supplier's currency.
    paidAmountAfter: { type: Number, required: true, min: 0 },
    paymentDate: { type: Date, default: null },
    method: { type: String, enum: ["Bank transfer", "Cash", "Card", "Other", null], default: null },
    reference: { type: String, trim: true, maxlength: 100, default: "" },
    note: { type: String, trim: true, maxlength: 300, default: "" },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
    recordedByName: { type: String, trim: true, maxlength: 100, required: true },
    recordedAt: { type: Date, default: Date.now },
    reconciledAt: { type: Date, default: null },
    statementReference: { type: String, trim: true, maxlength: 100, default: "" },
    reconciledBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    reconciledByName: { type: String, trim: true, maxlength: 100, default: "" },
    reconciliationHistory: { type: [reconciliationEventSchema], default: [] },
    // Append-only, reviewed advice details. Does not change the cost ledger or send mail.
    remittanceRevisions: { type: [remittanceRevisionSchema], default: [] },
});

const costEntrySchema = new mongoose.Schema(
    {
        recordType: { type: String, enum: ["Quotation", "Booking"], required: true },
        recordId: { type: mongoose.Schema.Types.ObjectId, required: true },
        category: {
            type: String,
            enum: ["Hotel", "Transport", "Guide", "Activities", "Entrance Fees", "Payment Fees", "Other"],
            required: true,
        },
        description: { type: String, required: true, trim: true, maxlength: 200 },
        amount: { type: Number, required: true, min: 0.01 },
        currency: { type: String, enum: ["USD", "LKR", "EUR", "GBP"], required: true },
        // Snapshot: one unit of the supplier currency in the record's sale currency.
        conversionRate: { type: Number, required: true, min: 0.000001 },
        targetCurrency: { type: String, enum: ["USD", "LKR", "EUR", "GBP"], required: true },
        // Actual booking costs only. Both amounts are in the supplier's currency.
        paidAmount: {
            type: Number, default: 0, min: 0,
            validate: {
                validator(value) { return value <= this.amount; },
                message: "Paid amount cannot exceed the supplier cost",
            },
        },
        paymentDueDate: { type: Date, default: null },
        // Older paidAmount values are opening balances; later changes are recorded here.
        paymentHistory: { type: [paymentHistorySchema], default: [] },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
    },
    { timestamps: true, optimisticConcurrency: true }
);

costEntrySchema.index({ recordType: 1, recordId: 1, createdAt: -1 });
costEntrySchema.index({ recordType: 1, paymentDueDate: 1 });
costEntrySchema.index({ recordType: 1, "paymentHistory.paymentDate": -1 });

module.exports = mongoose.model("CostEntry", costEntrySchema);
