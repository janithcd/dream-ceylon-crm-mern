const mongoose = require("mongoose");
const { TYPES, STATUSES, FIELDS } = require("../utils/excursions");
const history = new mongoose.Schema({
    action: { type: String, required: true }, fromStatus: String, toStatus: String,
    note: { type: String, maxlength: 300, default: "" }, at: { type: Date, required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true }, byName: { type: String, maxlength: 100, required: true },
}, { _id: false });
module.exports = new mongoose.Schema({
    ...Object.fromEntries(Object.entries(FIELDS).map(([key, max]) => [key, { type: String, maxlength: max, default: "" }])),
    type: { type: String, enum: TYPES, required: true }, date: { type: Date, required: true },
    startTime: { type: String, default: "", match: /^$|^([01]\d|2[0-3]):[0-5]\d$/ },
    participants: { type: Number, required: true, min: 1 },
    status: { type: String, enum: STATUSES, default: "Planned" },
    confirmationReference: { type: String, default: "", maxlength: 100 }, followUpDate: { type: Date, default: null },
    history: { type: [history], default: [] }, createdAt: { type: Date, default: Date.now },
});
