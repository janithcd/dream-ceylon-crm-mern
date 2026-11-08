const Booking = require("../models/Booking");
const { getDocumentBrandConfig } = require("../utils/documentSettings");
const { buildGuestTravelPack } = require("../utils/guestTravelPack");
const { createGuestItineraryPdf } = require("./guestItineraryPdfController");
const { createActivityLog } = require("../utils/createActivityLog");
const { formatDocumentDate } = require("../utils/documentDate");

const load = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!/^[a-f\d]{24}$/i.test(req.params.id || "")) { res.status(400).json({ message: "Invalid booking ID." }); return null; }
    const booking = await Booking.findById(req.params.id);
    if (!booking) { res.status(404).json({ message: "Booking not found." }); return null; }
    const company = await getDocumentBrandConfig();
    return { booking, company, review: buildGuestTravelPack(booking, company) };
};
const fail = (res, error) => { console.error("Guest travel pack failed:", error.message); return res.status(500).json({ message: "Could not prepare the guest travel pack." }); };
const previewGuestTravelPack = async (req, res) => {
    try { const snapshot = await load(req, res); if (snapshot) return res.json(snapshot.review); }
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
module.exports = { previewGuestTravelPack, generateGuestTravelPack };
