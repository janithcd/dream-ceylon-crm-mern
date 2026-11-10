const mongoose = require("mongoose");

module.exports = new mongoose.Schema({
    contactedAt: { type: Date, required: true },
    contactedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
    contactedByName: { type: String, trim: true, maxlength: 120, default: "" },
    channel: { type: String, enum: ["Email", "WhatsApp", "Phone", "Other"], required: true },
    note: { type: String, trim: true, maxlength: 300, default: "" },
    nextFollowUpDate: { type: Date, default: null },
});
