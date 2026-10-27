const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const Admin = require("../models/Admin");
const { PERMISSIONS, resolveAdminPermissions } = require("../config/permissions");
const { createActivityLog } = require("../utils/createActivityLog");
const { PAGE_SIZE, FILTERS, activeTripQuery, buildTripSupportQuery, isActiveTrip,
    summarizeTripSupport, buildTripSupportAlertsPipeline, parseNewIssue, parseIssueAction } = require("../utils/tripSupport");

const validId = (id) => mongoose.Types.ObjectId.isValid(id);
const noStore = (res) => res.setHeader("Cache-Control", "no-store");
const logIssue = (req, booking, description, issue) => createActivityLog({ req, action: "UPDATE", module: "Booking",
    description: `${description} for booking ${booking.bookingCode}`,
    relatedRecordId: booking._id, relatedModel: "Booking", referenceNo: booking.bookingCode,
    customerName: booking.customer?.fullName,
    metadata: { category: issue.category, priority: issue.priority, status: issue.status,
        assignedTo: issue.assignedTo || null, assignedToName: issue.assignedToName || "" },
});
const resolveAssignee = async (value, req) => {
    if (value === undefined || String(value) === String(req.admin._id)) {
        return { value: { assignedTo: req.admin._id, assignedToName: (req.admin.name || "").slice(0, 120) } };
    }
    if (value === null || value === "") return { value: { assignedTo: null, assignedToName: "" } };
    if (typeof value !== "string" || !validId(value)) return { error: "Choose a valid issue owner." };
    const admin = await Admin.findById(value).select("_id name role status customPermissions");
    if (!admin || admin.status !== "Active" || !resolveAdminPermissions(admin).includes(PERMISSIONS.BOOKING_UPDATE)) {
        return { error: "Issue owner must be an active staff member who can update bookings." };
    }
    return { value: { assignedTo: admin._id, assignedToName: admin.name.slice(0, 120) } };
};

const getTripSupportQueue = async (req, res) => {
    noStore(res);
    const filter = req.query.filter || "open";
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    if (!FILTERS.includes(filter) || !Number.isSafeInteger(page) || page < 1 || page > 1000) {
        return res.status(400).json({ message: "Choose a valid trip support filter and page." });
    }
    try {
        const now = new Date();
        const adminId = req.admin._id;
        const [bookings, total, active, open, mine, unassigned] = await Promise.all([
            Booking.find(buildTripSupportQuery(filter, now, adminId))
                .select("bookingCode customer.fullName bookingStatus travelStartDate travelEndDate tripIssues.status tripIssues.priority tripIssues.nextFollowUpDate tripIssues.assignedTo tripIssues.assignedToName")
                .sort({ travelEndDate: 1, _id: 1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
            Booking.countDocuments(buildTripSupportQuery(filter, now, adminId)),
            Booking.countDocuments(activeTripQuery(now)),
            Booking.countDocuments(buildTripSupportQuery("open", now)),
            Booking.countDocuments(buildTripSupportQuery("mine", now, adminId)),
            Booking.countDocuments(buildTripSupportQuery("unassigned", now)),
        ]);
        return res.json({ items: bookings.map((booking) => summarizeTripSupport(booking, now, adminId)),
            total, page, pages: Math.ceil(total / PAGE_SIZE) || 1, filter, summary: { active, open, mine, unassigned } });
    } catch (error) {
        console.error("Trip support queue failed:", error.message);
        return res.status(500).json({ message: "Failed to load trip support." });
    }
};

const loadAttention = async (adminId, limit = 5, page = 1) => {
    const [result] = await Booking.aggregate(buildTripSupportAlertsPipeline(adminId, new Date(), limit, page));
    return { summary: result?.summary?.[0] || {
        count: 0, bookings: 0, urgent: 0, overdue: 0, dueToday: 0, unassigned: 0,
    }, items: result?.items || [] };
};

const getTripSupportAlerts = async (req, res) => {
    noStore(res);
    try {
        return res.json(await loadAttention(req.admin._id));
    } catch (error) {
        console.error("Trip support alerts failed:", error.message);
        return res.status(500).json({ message: "Failed to load trip support alerts." });
    }
};

const getTripSupportAttention = async (req, res) => {
    noStore(res);
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000) {
        return res.status(400).json({ message: "Choose a valid trip support page." });
    }
    try {
        const result = await loadAttention(req.admin._id, PAGE_SIZE, page);
        return res.json({ ...result, filter: "attention", page, pages: Math.ceil(result.summary.bookings / PAGE_SIZE) || 1,
            total: result.summary.bookings });
    } catch (error) {
        console.error("Trip support worklist failed:", error.message);
        return res.status(500).json({ message: "Failed to load the trip support worklist." });
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
        const owner = await resolveAssignee(req.body?.assignedTo, req);
        if (owner.error) return res.status(400).json({ message: owner.error });
        const booking = await Booking.findOneAndUpdate({ _id: req.params.id, ...activeTripQuery(),
            "tripIssues.29": { $exists: false } },
        { $push: { tripIssues: { ...parsed.value, ...owner.value, _id: issueId } } }, { returnDocument: "after", runValidators: true });
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

const assignTripIssue = async (req, res) => {
    noStore(res);
    if (!validId(req.params.id) || !validId(req.params.issueId)) return res.status(400).json({ message: "Invalid booking or issue ID" });
    if (!Number.isSafeInteger(req.body?.expectedRevision) || req.body.expectedRevision < 0 ||
        !Object.hasOwn(req.body, "assignedTo")) return res.status(400).json({ message: "Refresh the issue and choose an owner or unassigned." });
    try {
        const current = await Booking.findById(req.params.id).select("tripIssues");
        if (!current) return res.status(404).json({ message: "Booking not found" });
        const issue = current.tripIssues.id(req.params.issueId);
        if (!issue) return res.status(404).json({ message: "Trip issue not found" });
        if (issue.revision !== req.body.expectedRevision) return res.status(409).json({ message: "Trip issue changed. Refresh and try again." });
        if (issue.status !== "Open") return res.status(409).json({ message: "Reopen the resolved issue before changing its owner." });
        const owner = await resolveAssignee(req.body.assignedTo, req);
        if (owner.error) return res.status(400).json({ message: owner.error });
        if (String(issue.assignedTo || "") === String(owner.value.assignedTo || "")) {
            return res.status(400).json({ message: "Choose a different owner to record a change." });
        }
        const event = { action: "assigned", note: owner.value.assignedTo ? `Assigned to ${owner.value.assignedToName}` : "Owner cleared",
            at: new Date(), byName: req.admin?.name || "", nextFollowUpDate: issue.nextFollowUpDate || null };
        const updated = await Booking.findOneAndUpdate({ _id: req.params.id,
            tripIssues: { $elemMatch: { _id: issue._id, status: "Open", revision: issue.revision } } },
        { $set: { "tripIssues.$.assignedTo": owner.value.assignedTo,
            "tripIssues.$.assignedToName": owner.value.assignedToName },
        $inc: { "tripIssues.$.revision": 1 },
        $push: { "tripIssues.$.events": { $each: [event], $slice: -20 } } },
        { returnDocument: "after", runValidators: true });
        if (!updated) return res.status(409).json({ message: "Trip issue changed. Refresh and try again." });
        const changed = updated.tripIssues.id(issue._id);
        await logIssue(req, updated, "Trip issue owner changed", changed);
        return res.json({ issue: changed });
    } catch (error) {
        if (error.name === "ValidationError") return res.status(400).json({ message: "Issue owner is invalid." });
        console.error("Assign trip issue failed:", error.message);
        return res.status(500).json({ message: "Failed to assign trip issue." });
    }
};

module.exports = { getTripSupportQueue, getTripSupportAlerts, getTripSupportAttention,
    getTripIssues, addTripIssue, updateTripIssue, assignTripIssue };
