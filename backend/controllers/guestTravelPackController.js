const Booking = require("../models/Booking");
const { getDocumentBrandConfig } = require("../utils/documentSettings");
const { buildGuestTravelPack } = require("../utils/guestTravelPack");
const { createGuestItineraryPdf } = require("./guestItineraryPdfController");
const { createActivityLog } = require("../utils/createActivityLog");
const { formatDocumentDate } = require("../utils/documentDate");
const { getConflicts } = require("../utils/bookingTransportConflicts");

const deliverySummary = (booking, fingerprint) => ({
    sentAt: booking.travelPackDelivery?.sentAt || null,
    sentByName: booking.travelPackDelivery?.sentByName || "",
    channel: booking.travelPackDelivery?.channel || null,
    current: Boolean(booking.travelPackDelivery?.sentAt && booking.travelPackDelivery.fingerprint === fingerprint),
    revision: booking.travelPackDeliveryRevision ?? 0,
});

const load = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!/^[a-f\d]{24}$/i.test(req.params.id || "")) { res.status(400).json({ message: "Invalid booking ID." }); return null; }
    const booking = await Booking.findById(req.params.id);
    if (!booking) { res.status(404).json({ message: "Booking not found." }); return null; }
    const vehicleReview = { uncheckableAssignmentIds: (booking.transportAssignments || [])
        .filter((item) => item.status === "Confirmed" && item.registration && !item.registrationKey)
        .map((item) => item._id) };
    try {
        vehicleReview.clashingAssignmentIds = (await getConflicts(booking)).map((item) => item.assignmentId);
    } catch (error) {
        console.error("Guest travel pack vehicle overlap check failed:", error.message);
        vehicleReview.unavailable = true;
    }
    const company = await getDocumentBrandConfig();
    return { booking, company, review: buildGuestTravelPack(booking, company, vehicleReview) };
};
const fail = (res, error) => { console.error("Guest travel pack failed:", error.message); return res.status(500).json({ message: "Could not prepare the guest travel pack." }); };
const previewGuestTravelPack = async (req, res) => {
    try { const snapshot = await load(req, res); if (snapshot) return res.json({ ...snapshot.review,
        delivery: deliverySummary(snapshot.booking, snapshot.review.fingerprint) }); }
    catch (error) { return fail(res, error); }
};
const generateGuestTravelPack = async (req, res) => {
    try {
        const snapshot = await load(req, res);
        if (!snapshot) return;
        const { booking, company, review } = snapshot;
        if (req.body?.reviewed !== true || !/^[a-f0-9]{64}$/.test(req.body?.fingerprint || "")) return res.status(400).json({ message: "Review the travel pack and acknowledge the details before downloading." });
        if (!review.ready) return res.status(409).json({ message: "Resolve the travel pack blockers and preview again." });
        if (req.body.fingerprint !== review.fingerprint) return res.status(409).json({ message: "The booking or document details changed. Reload and review the travel pack again." });
        const bytes = await createGuestItineraryPdf(review.pack, { ...review.brand, logoPath: company.logoPath }, {
            title: "YOUR TRAVEL PACK", introduction: `Prepared on ${formatDocumentDate(new Date())}. ${review.pack.notice}`,
        });
        // Rendering may take time for a long trip. Do not return a document if
        // its guest details changed (or the booking closed) during generation.
        const current = await load(req, res);
        if (!current) return;
        if (!current.review.ready || current.review.fingerprint !== review.fingerprint) {
            return res.status(409).json({ message: "The booking or document details changed while preparing the PDF. Reload and review the travel pack again." });
        }
        const filename = `dream-ceylon-travel-pack-${String(booking.bookingCode || "booking").replace(/[^a-zA-Z0-9-]/g, "-")}.pdf`;
        await createActivityLog({ req, action: "GENERATE", module: "PDF", description: `Guest travel pack generated for booking ${booking.bookingCode}`,
            relatedRecordId: booking._id, relatedModel: "Booking", referenceNo: booking.bookingCode,
            metadata: { documentType: "Guest Travel Pack", filename, counts: review.counts, warningCount: review.warnings.length } });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        return res.send(Buffer.from(bytes));
    } catch (error) { return fail(res, error); }
};

const recordGuestTravelPackDelivery = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const { action, expectedRevision, fingerprint, channel, reason } = req.body || {};
    if (!["sent", "clear"].includes(action) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
        return res.status(400).json({ message: "Choose an action and refresh the travel pack delivery record." });
    }
    if (action === "sent" && (!/^[a-f0-9]{64}$/.test(fingerprint || "") || !["Email", "WhatsApp", "Other"].includes(channel))) {
        return res.status(400).json({ message: "Review the current pack and choose how it was sent." });
    }
    if (action === "clear" && (typeof reason !== "string" || reason.trim().length < 10 || reason.trim().length > 300)) {
        return res.status(400).json({ message: "Explain the correction in 10 to 300 characters." });
    }
    try {
        const snapshot = await load(req, res);
        if (!snapshot) return;
        const { booking, review } = snapshot;
        if ((booking.travelPackDeliveryRevision ?? 0) !== expectedRevision ||
            (action === "sent" && (booking.travelPackDelivery?.fingerprint === fingerprint || !review.ready || review.fingerprint !== fingerprint)) ||
            (action === "clear" && !booking.travelPackDelivery?.sentAt)) {
            return res.status(409).json({ message: "The pack or delivery record changed. Reload the preview and try again." });
        }
        const delivery = action === "sent" ? { sentAt: new Date(), sentBy: req.admin._id,
            sentByName: (req.admin.name || "").slice(0, 120), channel, fingerprint } : null;
        const updated = await Booking.findOneAndUpdate({
            _id: booking._id,
            travelPackDeliveryRevision: expectedRevision === 0 ? { $in: [null, 0] } : expectedRevision,
            ...(action === "sent" ? { "travelPackDelivery.fingerprint": { $ne: fingerprint },
                bookingStatus: { $in: ["Confirmed", "In Progress"] } }
                : { "travelPackDelivery.sentAt": booking.travelPackDelivery.sentAt }),
        }, { $set: { travelPackDelivery: delivery }, $inc: { travelPackDeliveryRevision: 1 } },
        { returnDocument: "after", runValidators: true });
        if (!updated) return res.status(409).json({ message: "The delivery record changed. Reload the preview and try again." });
        await createActivityLog({ req, action: "UPDATE", module: "Booking",
            description: action === "sent" ? `Guest travel pack sent record updated for booking ${updated.bookingCode}`
                : `Guest travel pack sent record corrected for booking ${updated.bookingCode}`,
            relatedRecordId: updated._id, relatedModel: "Booking", referenceNo: updated.bookingCode,
            customerName: updated.customer?.fullName,
            metadata: action === "sent" ? { channel } : { reason: reason.trim() },
        });
        return res.json({ delivery: deliverySummary(updated, fingerprint) });
    } catch (error) { return fail(res, error); }
};

module.exports = { previewGuestTravelPack, generateGuestTravelPack, recordGuestTravelPackDelivery };
