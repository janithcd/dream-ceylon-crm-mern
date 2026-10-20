const crypto = require("node:crypto");
const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const TourPackage = require("../models/TourPackage");
const { buildPackageItineraryImport } = require("../utils/packageItineraryImport");
const { createActivityLog } = require("../utils/createActivityLog");

const readImport = async (id, startDate) => {
    const booking = await Booking.findById(id);
    if (!booking) return { status: 404, message: "Booking not found" };
    if (booking.bookingStatus === "Cancelled") return { status: 409, message: "Cancelled bookings cannot be planned" };
    if (booking.itineraryDays?.length) return { status: 409, message: "Import is available only when the booking itinerary is empty" };
    if (!booking.selectedPackage) return { status: 409, message: "Select a tour package on this booking before importing" };

    const tourPackage = await TourPackage.findById(booking.selectedPackage);
    if (!tourPackage) return { status: 409, message: "Selected tour package no longer exists" };
    const result = buildPackageItineraryImport(tourPackage, booking, startDate);
    if (result.error) return { status: 400, message: result.error };

    const token = crypto.createHash("sha256").update(JSON.stringify({
        bookingId: String(booking._id),
        packageId: String(tourPackage._id),
        packageTitle: tourPackage.title,
        startDate,
        travelStartDate: booking.travelStartDate,
        travelEndDate: booking.travelEndDate,
        days: result.days,
    })).digest("hex");
    return { booking, tourPackage, days: result.days, token };
};

const previewPackageItinerary = async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: "Invalid booking ID" });
    }
    try {
        const result = await readImport(req.params.id, req.query.startDate);
        if (result.status) return res.status(result.status).json({ message: result.message });
        return res.json({
            packageTitle: result.tourPackage.title,
            days: result.days,
            previewToken: result.token,
        });
    } catch (error) {
        return res.status(500).json({ message: "Failed to preview package itinerary" });
    }
};

const importPackageItinerary = async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: "Invalid booking ID" });
    }
    if (typeof req.body?.previewToken !== "string" || !/^[a-f0-9]{64}$/.test(req.body.previewToken)) {
        return res.status(400).json({ message: "Preview the package itinerary before importing" });
    }
    try {
        const result = await readImport(req.params.id, req.body.startDate);
        if (result.status) return res.status(result.status).json({ message: result.message });
        if (result.token !== req.body.previewToken) {
            return res.status(409).json({ message: "Package or trip changed. Preview again before importing." });
        }

        const booking = await Booking.findOneAndUpdate(
            {
                _id: req.params.id,
                selectedPackage: result.tourPackage._id,
                bookingStatus: { $ne: "Cancelled" },
                travelStartDate: result.booking.travelStartDate,
                travelEndDate: result.booking.travelEndDate,
                "itineraryDays.0": { $exists: false },
            },
            { $push: { itineraryDays: { $each: result.days } } },
            { returnDocument: "after", runValidators: true }
        );
        if (!booking) {
            return res.status(409).json({ message: "Booking changed. Refresh and preview the package again." });
        }

        await createActivityLog({
            req, action: "UPDATE", module: "Booking",
            description: `Package itinerary imported for booking ${booking.bookingCode}`,
            relatedRecordId: booking._id, relatedModel: "Booking",
            referenceNo: booking.bookingCode, customerName: booking.customer?.fullName,
            metadata: { packageId: result.tourPackage._id, packageTitle: result.tourPackage.title, entries: result.days.length },
        });
        return res.status(201).json({
            travelStartDate: booking.travelStartDate,
            travelEndDate: booking.travelEndDate,
            bookingStatus: booking.bookingStatus,
            days: [...booking.itineraryDays].sort((a, b) => new Date(a.date) - new Date(b.date)),
            importedCount: result.days.length,
        });
    } catch (error) {
        return res.status(500).json({ message: "Failed to import package itinerary" });
    }
};

module.exports = { previewPackageItinerary, importPackageItinerary };
