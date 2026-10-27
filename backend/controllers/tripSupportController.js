const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const { createActivityLog } = require("../utils/createActivityLog");
const { PAGE_SIZE, FILTERS, activeTripQuery, buildTripSupportQuery, isActiveTrip,
    summarizeTripSupport, parseNewIssue, parseIssueAction } = require("../utils/tripSupport");

const validId = (id) => mongoose.Types.ObjectId.isValid(id);
const noStore = (res) => res.setHeader("Cache-Control", "no-store");
const logIssue = (req, booking, description, issue) => createActivityLog({ req, action: "UPDATE", module: "Booking",
    description: `${description} for booking ${booking.bookingCode}`,
    relatedRecordId: booking._id, relatedModel: "Booking", referenceNo: booking.bookingCode,
    customerName: booking.customer?.fullName,
    metadata: { category: issue.category, priority: issue.priority, status: issue.status },
});

const getTripSupportQueue = async (req, res) => {
    noStore(res);
    const filter = req.query.filter || "open";
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    if (!FILTERS.includes(filter) || !Number.isSafeInteger(page) || page < 1 || page > 1000) {
        return res.status(400).json({ message: "Choose a valid trip support filter and page." });
    }
    try {
        const now = new Date();
        const [bookings, total, active, open] = await Promise.all([
            Booking.find(buildTripSupportQuery(filter, now))
                .select("bookingCode customer.fullName bookingStatus travelStartDate travelEndDate tripIssues.status tripIssues.priority tripIssues.nextFollowUpDate")
                .sort({ travelEndDate: 1, _id: 1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
            Booking.countDocuments(buildTripSupportQuery(filter, now)),
            Booking.countDocuments(activeTripQuery(now)),
            Booking.countDocuments(buildTripSupportQuery("open", now)),
        ]);
        return res.json({ items: bookings.map((booking) => summarizeTripSupport(booking, now)),
            total, page, pages: Math.ceil(total / PAGE_SIZE) || 1, filter, summary: { active, open } });
    } catch (error) {
        console.error("Trip support queue failed:", error.message);
        return res.status(500).json({ message: "Failed to load trip support." });
    }
};

const getTripIssues = async (req, res) => {
    noStore(res);
    if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid booking ID" });
    try {
        const booking = await Booking.findById(req.params.id)
            .select("bookingCode customer.fullName bookingStatus travelStartDate travelEndDate tripIssues");
        if (!booking) return res.status(404).json({ message: "Booking not found" });
        return res.json({ bookingCode: booking.bookingCode, customerName: booking.customer?.fullName || "",
            bookingStatus: booking.bookingStatus, canOpenIssue: isActiveTrip(booking),
            travelStartDate: booking.travelStartDate, travelEndDate: booking.travelEndDate,
            issues: [...booking.tripIssues].sort((a, b) => new Date(b.openedAt) - new Date(a.openedAt)) });
    } catch (error) {
        return res.status(500).json({ message: "Failed to load trip issues." });
    }
};

const addTripIssue = async (req, res) => {
    noStore(res);
    if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid booking ID" });
    const parsed = parseNewIssue(req.body, req.admin?.name);
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    const issueId = new mongoose.Types.ObjectId();
    try {
        const booking = await Booking.findOneAndUpdate({ _id: req.params.id, ...activeTripQuery(),
            "tripIssues.29": { $exists: false } },
        { $push: { tripIssues: { ...parsed.value, _id: issueId } } }, { returnDocument: "after", runValidators: true });
        if (!booking) {
            return res.status((await Booking.exists({ _id: req.params.id })) ? 409 : 404)
                .json({ message: "Only active trips can add issues, with a maximum of 30 per booking. Refresh and review the trip." });
        }
        const issue = booking.tripIssues.id(issueId);
        await logIssue(req, booking, "Trip issue opened", issue);
        return res.status(201).json({ issue });
    } catch (error) {
        if (error.name === "ValidationError") return res.status(400).json({ message: "Trip issue is invalid." });
        console.error("Create trip issue failed:", error.message);
        return res.status(500).json({ message: "Failed to add trip issue." });
    }
};

const updateTripIssue = async (req, res) => {
    noStore(res);
    if (!validId(req.params.id) || !validId(req.params.issueId)) return res.status(400).json({ message: "Invalid booking or issue ID" });
    try {
        const current = await Booking.findById(req.params.id).select("tripIssues");
        if (!current) return res.status(404).json({ message: "Booking not found" });
        const issue = current.tripIssues.id(req.params.issueId);
        if (!issue) return res.status(404).json({ message: "Trip issue not found" });
        if (Number.isSafeInteger(req.body?.expectedRevision) && issue.revision !== req.body.expectedRevision) {
            return res.status(409).json({ message: "Trip issue changed. Refresh and try again." });
        }
        const parsed = parseIssueAction(req.body, issue, req.admin?.name);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const updated = await Booking.findOneAndUpdate({ _id: req.params.id,
            tripIssues: { $elemMatch: { _id: issue._id, status: issue.status, revision: issue.revision } } },
        { $set: { "tripIssues.$.status": parsed.value.status,
            "tripIssues.$.resolvedAt": parsed.value.resolvedAt,
            "tripIssues.$.nextFollowUpDate": parsed.value.nextFollowUpDate },
        $inc: { "tripIssues.$.revision": 1 },
        $push: { "tripIssues.$.events": { $each: [parsed.value.event], $slice: -20 } } },
        { returnDocument: "after", runValidators: true });
        if (!updated) return res.status(409).json({ message: "Trip issue changed. Refresh and try again." });
        const changed = updated.tripIssues.id(issue._id);
        await logIssue(req, updated, `Trip issue ${req.body.action}`, changed);
        return res.json({ issue: changed });
    } catch (error) {
        if (error.name === "ValidationError") return res.status(400).json({ message: "Trip issue is invalid." });
        console.error("Update trip issue failed:", error.message);
        return res.status(500).json({ message: "Failed to update trip issue." });
    }
};

module.exports = { getTripSupportQueue, getTripIssues, addTripIssue, updateTripIssue };
