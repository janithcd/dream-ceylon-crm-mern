const mongoose = require("mongoose");
const Inquiry = require("../models/Inquiry");
const Admin = require("../models/Admin");
const { PERMISSIONS, resolveAdminPermissions } = require("../config/permissions");
const { createActivityLog } = require("../utils/createActivityLog");

const FILTERS = ["all", "unassigned", "mine"];
const CHANNELS = ["Email", "WhatsApp", "Phone", "Other"];
const OPEN_STATUSES = ["New", "Contacted", "Follow Up"];
const validId = (value) => typeof value === "string" && mongoose.Types.ObjectId.isValid(value);

const getLeadAssignees = async (req, res) => {
    try {
        const admins = await Admin.find({ status: "Active" })
            .select("_id name role status customPermissions")
            .sort({ name: 1 })
            .lean();
        return res.json({ admins: admins
            .filter((admin) => resolveAdminPermissions(admin).includes(PERMISSIONS.INQUIRY_UPDATE))
            .map(({ _id, name, role }) => ({ _id, name, role })) });
    } catch (error) {
        return res.status(500).json({ message: "Failed to load lead assignees." });
    }
};

const getLeadTriage = async (req, res) => {
    const filter = req.query.filter || "all";
    const pageText = req.query.page === undefined ? "1" : req.query.page;
    if (typeof filter !== "string" || !FILTERS.includes(filter) ||
        typeof pageText !== "string" || !/^[1-9]\d{0,5}$/.test(pageText)) {
        return res.status(400).json({ message: "Choose a valid filter and page." });
    }
    const page = Number(pageText);
    const limit = 25;
    const query = { status: "New" };
    if (filter === "unassigned") query.assignedTo = null;
    if (filter === "mine") query.assignedTo = req.admin._id;

    try {
        const [items, total, unassigned, mine, all] = await Promise.all([
            Inquiry.find(query)
                .select("fullName email whatsappNumber country source priority travelDate createdAt status assignedTo firstContactAt")
                .sort({ createdAt: 1, _id: 1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .populate("assignedTo", "name role status"),
            Inquiry.countDocuments(query),
            Inquiry.countDocuments({ status: "New", assignedTo: null }),
            Inquiry.countDocuments({ status: "New", assignedTo: req.admin._id }),
            Inquiry.countDocuments({ status: "New" }),
        ]);
        return res.json({ items, total, page, totalPages: Math.ceil(total / limit) || 1,
            summary: { all, unassigned, mine } });
    } catch (error) {
        return res.status(500).json({ message: "Failed to load new inquiries." });
    }
};

const getLeadAttention = async (req, res) => {
    const query = { status: "New", $or: [{ assignedTo: null }, { assignedTo: req.admin._id }] };
    const waitingSince = new Date(Date.now() - 24 * 60 * 60 * 1000);
    try {
        const [items, unassigned, mine, waiting24h] = await Promise.all([
            Inquiry.find(query)
                .select("fullName email createdAt priority assignedTo")
                .sort({ createdAt: 1, _id: 1 })
                .limit(5)
                .lean(),
            Inquiry.countDocuments({ status: "New", assignedTo: null }),
            Inquiry.countDocuments({ status: "New", assignedTo: req.admin._id }),
            Inquiry.countDocuments({ ...query, createdAt: { $lte: waitingSince } }),
        ]);
        return res.json({
            items: items.map((item) => ({ ...item, waiting24h: item.createdAt <= waitingSince })),
            summary: { total: unassigned + mine, unassigned, mine, waiting24h },
        });
    } catch (error) {
        return res.status(500).json({ message: "Failed to load lead alerts." });
    }
};

const logChange = async (req, inquiry, description, metadata) => {
    await createActivityLog({
        req, action: "UPDATE", module: "Inquiry", description,
        relatedRecordId: inquiry._id, relatedModel: "Inquiry",
        referenceNo: inquiry._id.toString(), customerName: inquiry.fullName, metadata,
    });
};

const assignLead = async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid inquiry ID." });
    const requested = req.body?.assignedTo;
    let assignedTo = null;
    if (requested !== null && requested !== "") {
        if (!validId(requested)) return res.status(400).json({ message: "Choose a valid owner." });
        try {
            const admin = await Admin.findById(requested).select("_id name role status customPermissions");
            if (!admin || admin.status !== "Active" ||
                !resolveAdminPermissions(admin).includes(PERMISSIONS.INQUIRY_UPDATE)) {
                return res.status(400).json({ message: "Owner must be an active admin who can update inquiries." });
            }
            assignedTo = admin._id;
        } catch (error) {
            return res.status(500).json({ message: "Failed to check the lead owner." });
        }
    }

    try {
        const inquiry = await Inquiry.findOneAndUpdate(
            { _id: req.params.id, status: { $in: OPEN_STATUSES } },
            { $set: { assignedTo } },
            { new: true, runValidators: true }
        );
        if (!inquiry) {
            const exists = await Inquiry.exists({ _id: req.params.id });
            return res.status(exists ? 409 : 404).json({ message: exists ? "Closed inquiries cannot be reassigned." : "Inquiry not found." });
        }
        await inquiry.populate("assignedTo", "name role status");
        await logChange(req, inquiry, `Lead owner ${assignedTo ? "assigned" : "cleared"} for ${inquiry.fullName}`,
            { assignedTo: assignedTo || null });
        return res.json({ inquiry });
    } catch (error) {
        return res.status(500).json({ message: "Failed to assign the inquiry." });
    }
};

const recordLeadContact = async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid inquiry ID." });
    if (!CHANNELS.includes(req.body?.channel)) {
        return res.status(400).json({ message: "Choose Email, WhatsApp, Phone, or Other." });
    }
    const now = new Date();
    try {
        // A reopened inquiry keeps the earliest recorded contact and its owner.
        const inquiry = await Inquiry.findOneAndUpdate(
            { _id: req.params.id, status: "New" },
            [{ $set: {
                status: "Contacted",
                assignedTo: { $ifNull: ["$assignedTo", req.admin._id] },
                firstContactAt: { $ifNull: ["$firstContactAt", now] },
                firstContactChannel: { $ifNull: ["$firstContactChannel", req.body.channel] },
                firstContactBy: { $ifNull: ["$firstContactBy", req.admin._id] },
            } }],
            { new: true, updatePipeline: true }
        );
        if (!inquiry) {
            const exists = await Inquiry.exists({ _id: req.params.id });
            return res.status(exists ? 409 : 404).json({ message: exists ? "This inquiry is no longer new. Refresh the queue." : "Inquiry not found." });
        }
        await inquiry.populate("assignedTo", "name role status");
        await logChange(req, inquiry, `Contact recorded for inquiry ${inquiry.fullName}`,
            { channel: req.body.channel, contactedBy: req.admin._id, firstContactAt: inquiry.firstContactAt });
        return res.json({ inquiry });
    } catch (error) {
        console.error("[Record Lead Contact]", error);
        return res.status(500).json({ message: "Failed to record contact." });
    }
};

module.exports = { getLeadAssignees, getLeadTriage, getLeadAttention, assignLead, recordLeadContact };
