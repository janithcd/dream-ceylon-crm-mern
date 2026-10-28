const mongoose = require("mongoose");

const bookingHandoverReadSchema = new mongoose.Schema({
    booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true },
    admin: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
    seenCount: { type: Number, min: 0, default: 0 },
}, { timestamps: true });

bookingHandoverReadSchema.index({ booking: 1, admin: 1 }, { unique: true });

module.exports = mongoose.model("BookingHandoverRead", bookingHandoverReadSchema);
