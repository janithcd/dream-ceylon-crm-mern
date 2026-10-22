const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const { ACTIVE_BOOKING_STATUSES } = require("../utils/myTasks");
const { createActivityLog } = require("../utils/createActivityLog");
const { SERVICE_FIELDS, parseSupplierContact, presentSupplierContacts } = require("../utils/supplierContact");

const checkRoute = (req, res) => {
    if (!SERVICE_FIELDS[req.params.type] || !mongoose.Types.ObjectId.isValid(req.params.id) ||
        !mongoose.Types.ObjectId.isValid(req.params.itemId)) {
        res.status(400).json({ message: "Invalid supplier type, booking or service ID" });
        return null;
    }
    return SERVICE_FIELDS[req.params.type];
};

const getSupplierContacts = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const config = checkRoute(req, res);
    if (!config) return;
    try {
        const booking = await Booking.findById(req.params.id)
            .select(`bookingCode bookingStatus ${config.field}._id ${config.field}.${config.title} ${config.field}.status ${config.field}.${config.serviceDate} ${config.field}.followUpDate ${config.field}.contacts`);
        if (!booking) return res.status(404).json({ message: "Booking not found" });
        const item = booking[config.field].id(req.params.itemId);
        if (!item) return res.status(404).json({ message: "Supplier request not found in this booking" });
        return res.status(200).json(presentSupplierContacts(booking, item, req.params.type));
    } catch (error) {
        console.error("Supplier contact history failed:", error.message);
        return res.status(500).json({ message: "Failed to load supplier contact history" });
    }
};

const logSupplierContact = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const config = checkRoute(req, res);
    if (!config) return;
    try {
        const booking = await Booking.findById(req.params.id)
            .select(`bookingStatus ${config.field}._id ${config.field}.status ${config.field}.${config.serviceDate}`);
        if (!booking) return res.status(404).json({ message: "Booking not found" });
        const item = booking[config.field].id(req.params.itemId);
        if (!item) return res.status(404).json({ message: "Supplier request not found in this booking" });
        if (!ACTIVE_BOOKING_STATUSES.includes(booking.bookingStatus) || item.status !== "Requested") {
            return res.status(409).json({ message: "Only requested services on active bookings can be contacted from this queue" });
        }
        const parsed = parseSupplierContact(req.body || {}, item[config.serviceDate]);
        if (parsed.error) return res.status(400).json({ message: parsed.error });

        const event = {
            contactedAt: new Date(), contactedBy: req.admin._id,
            contactedByName: req.admin.name || "Staff member",
            ...parsed.value,
        };
        // Guard status and service date again to reject stale tabs and avoid scheduling a
        // follow-up past a service date that another staff member just changed.
        const updated = await Booking.findOneAndUpdate(
            {
                _id: req.params.id, bookingStatus: { $in: ACTIVE_BOOKING_STATUSES },
                [config.field]: { $elemMatch: {
                    _id: req.params.itemId, status: "Requested",
                    [config.serviceDate]: item[config.serviceDate],
                } },
            },
            {
                $push: { [`${config.field}.$.contacts`]: { $each: [event], $slice: -50 } },
                $set: { [`${config.field}.$.followUpDate`]: parsed.value.nextFollowUpDate },
            },
            { new: true, runValidators: true }
        );
        if (!updated) return res.status(409).json({ message: "This supplier request changed. Refresh it before logging contact" });
        const current = updated[config.field].id(req.params.itemId);
        await createActivityLog({
            req, action: "UPDATE", module: "Booking",
            description: `${req.params.type === "hotel" ? "Hotel" : "Transport"} supplier contact logged (${event.channel}) for booking ${updated.bookingCode}`,
            relatedRecordId: updated._id, relatedModel: "Booking",
            referenceNo: updated.bookingCode, customerName: updated.customer?.fullName,
            metadata: { supplierType: req.params.type, itemId: req.params.itemId, channel: event.channel, nextFollowUpDate: parsed.value.nextFollowUpDate },
        });
        return res.status(200).json(presentSupplierContacts(updated, current, req.params.type));
    } catch (error) {
        console.error("Supplier contact logging failed:", error.message);
        return res.status(500).json({ message: "Failed to log supplier contact" });
    }
};

module.exports = { getSupplierContacts, logSupplierContact };
