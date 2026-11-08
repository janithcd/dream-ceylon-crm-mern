const Booking = require("../models/Booking");
const { parseExcursion, transitionExcursion, buildExcursionMessage } = require("../utils/excursions");
const { parseExcursionSchedule, buildExcursionSchedule } = require("../utils/excursionSchedule");
const { createActivityLog } = require("../utils/createActivityLog");
const validId = (id) => typeof id === "string" && /^[a-f\d]{24}$/i.test(id);
const issue = (status, message) => Object.assign(new Error(message), { status });
const fields = "bookingCode bookingStatus travelStartDate travelEndDate numberOfTravelers excursions excursionsRevision";
const view = (booking) => ({ booking: { _id: booking._id, bookingCode: booking.bookingCode, bookingStatus: booking.bookingStatus,
    travelStartDate: booking.travelStartDate, travelEndDate: booking.travelEndDate, numberOfTravelers: booking.numberOfTravelers },
    items: booking.excursions || [], version: booking.excursionsRevision ?? 0 });
const load = async (req) => {
    if (!validId(req.params.id) || (req.params.excursionId && !validId(req.params.excursionId))) throw issue(400, "Choose a valid booking and activity.");
    const booking = await Booking.findById(req.params.id).select(fields);
    if (!booking) throw issue(404, "Booking not found.");
    return booking;
};
const respond = (res, error) => {
    if (error.status) return res.status(error.status).json({ message: error.message });
    if (error.name === "ValidationError") return res.status(400).json({ message: "Activity details are invalid." });
    console.error("Activity reservation failed:", error.message);
    return res.status(500).json({ message: "Could not update the activity reservation." });
};
const checkVersion = (req, booking) => {
    if (!Number.isSafeInteger(req.body?.expectedVersion) || req.body.expectedVersion < 0) throw issue(400, "Reload the activities before saving.");
    if (req.body.expectedVersion !== (booking.excursionsRevision ?? 0)) throw issue(409, "Activities changed. Reload before saving.");
};
const event = (req, action, fromStatus, toStatus, note = "") => ({ action, fromStatus, toStatus, note, at: new Date(),
    by: req.admin._id, byName: String(req.admin.name || "Staff").slice(0, 100) });
const persist = async (req, current, description) => {
    const version = current.excursionsRevision ?? 0;
    const saved = await Booking.findOneAndUpdate({ _id: current._id,
        excursionsRevision: version === 0 ? { $in: [0, null] } : version,
        travelStartDate: current.travelStartDate ?? null, travelEndDate: current.travelEndDate ?? null,
        numberOfTravelers: current.numberOfTravelers, bookingStatus: current.bookingStatus,
    }, { $set: { excursions: current.excursions.map((item) => item.toObject()) }, $inc: { excursionsRevision: 1, __v: 1 } },
    { returnDocument: "after", runValidators: true }).select(fields);
    if (!saved) throw issue(409, "The booking or activities changed. Reload before saving.");
    await createActivityLog({ req, action: "UPDATE", module: "Booking", description: `${description} for booking ${saved.bookingCode}`,
        relatedRecordId: saved._id, relatedModel: "Booking", referenceNo: saved.bookingCode });
    return view(saved);
};
const getExcursions = async (req, res) => {
    try { return res.json(view(await load(req))); } catch (error) { return respond(res, error); }
};
const saveExcursion = async (req, res) => {
    try {
        const booking = await load(req); checkVersion(req, booking);
        if (["Cancelled", "Completed"].includes(booking.bookingStatus)) throw issue(409, "This booking is closed. Only activity cancellation follow-up is available.");
        const item = req.params.excursionId ? booking.excursions.id(req.params.excursionId) : null;
        if (req.params.excursionId && !item) throw issue(404, "Activity not found on this booking.");
        if (item && ["Completed", "Cancellation requested"].includes(item.status)) throw issue(409, "This activity cannot be edited in its current state.");
        if (!item && booking.excursions.length >= 60) throw issue(409, "A booking can hold at most 60 activity records.");
        const parsed = parseExcursion(req.body, booking);
        if (parsed.error) throw issue(400, parsed.error);
        if (item) {
            const changed = ["title", "type", "date", "startTime", "participants", "supplierName", "meetingPoint"]
                .some((field) => String(item[field]) !== String(parsed.value[field]));
            const from = item.status;
            Object.assign(item, parsed.value);
            if (from === "Confirmed" && changed) { item.status = "Requested"; item.confirmationReference = ""; }
            item.history = [...item.history, event(req, "Details updated", from, item.status,
                from === "Confirmed" && changed ? "Reservation details changed; supplier reconfirmation required." : "")].slice(-50);
        } else booking.excursions.push({ ...parsed.value, status: "Planned", history: [event(req, "Created", "", "Planned")] });
        return res.status(item ? 200 : 201).json(await persist(req, booking, item ? "Activity details updated" : "Activity planned"));
    } catch (error) { return respond(res, error); }
};
const setExcursionStatus = async (req, res) => {
    try {
        const booking = await load(req); checkVersion(req, booking);
        const item = booking.excursions.id(req.params.excursionId);
        if (!item) throw issue(404, "Activity not found on this booking.");
        const parsed = transitionExcursion(item.toObject(), req.body, booking);
        if (parsed.error) throw issue(400, parsed.error);
        const { note, ...value } = parsed.value;
        item.history = [...item.history, event(req, "Status changed", item.status, value.status, note)].slice(-50);
        Object.assign(item, value);
        return res.json(await persist(req, booking, "Activity status updated"));
    } catch (error) { return respond(res, error); }
};
const getExcursionMessage = async (req, res) => {
    try {
        const booking = await load(req), item = booking.excursions.id(req.params.excursionId);
        if (!item) throw issue(404, "Activity not found on this booking.");
        const parsed = buildExcursionMessage(item, booking, req.query.audience);
        if (parsed.error) throw issue(400, parsed.error);
        return res.json(parsed.value);
    } catch (error) { return respond(res, error); }
};
const getExcursionSchedule = async (req, res) => {
    const parsed = parseExcursionSchedule(req.query);
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    try {
        const [result] = await Booking.aggregate(buildExcursionSchedule(parsed.value));
        const total = result?.count[0]?.total || 0;
        return res.json({ items: result?.items || [], summary: result?.summary[0] || { requested: 0, confirmed: 0, followUpDue: 0 },
            total, page: parsed.value.page, pages: Math.max(1, Math.ceil(total / 25)) });
    } catch (error) { return respond(res, error); }
};
module.exports = { getExcursions, saveExcursion, setExcursionStatus, getExcursionMessage, getExcursionSchedule };
