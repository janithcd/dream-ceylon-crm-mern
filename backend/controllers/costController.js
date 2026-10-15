const Quotation = require("../models/Quotation");
const Booking = require("../models/Booking");
const CostEntry = require("../models/CostEntry");
const { createActivityLog } = require("../utils/createActivityLog");
const { costSummary, parseCostPayload } = require("../utils/costProfit");

const TYPES = { quotation: "Quotation", booking: "Booking" };
const validId = (id) => /^[0-9a-f]{24}$/i.test(String(id || ""));

const loadRecord = async (recordType, recordId) => {
    if (recordType === "Quotation") {
        const record = await Quotation.findById(recordId).select("quotationNo clientName tourTitle currency totals booking");
        return record && {
            id: record._id,
            reference: record.quotationNo,
            customerName: record.clientName,
            title: record.tourTitle,
            currency: record.currency,
            saleAmount: record.totals?.grandTotal || 0,
            bookingId: record.booking || null,
        };
    }
    const record = await Booking.findById(recordId).select("bookingCode customer currency totalPrice bookingStatus");
    return record && {
        id: record._id,
        reference: record.bookingCode,
        customerName: record.customer?.fullName,
        title: record.bookingStatus,
        currency: record.currency,
        saleAmount: record.totalPrice || 0,
    };
};

const getCostOverview = async (req, res) => {
    const recordType = TYPES[req.params.type];
    const recordId = req.params.id;
    if (!recordType || !validId(recordId)) {
        return res.status(400).json({ message: "Choose a valid quotation or booking." });
    }
    try {
        const record = await loadRecord(recordType, recordId);
        if (!record) return res.status(404).json({ message: "Quotation or booking not found." });

        const items = await CostEntry.find({ recordType, recordId }).sort({ createdAt: -1 }).lean();
        const summary = costSummary(record.saleAmount, record.currency, items);
        let linkedEstimate = null;

        if (recordType === "Booking") {
            const quotation = await Quotation.findOne({ booking: recordId }).select("_id quotationNo currency totals");
            if (quotation) {
                const estimateItems = await CostEntry.find({ recordType: "Quotation", recordId: quotation._id }).lean();
                const estimate = costSummary(quotation.totals?.grandTotal, quotation.currency, estimateItems);
                linkedEstimate = {
                    quotationId: quotation._id,
                    reference: quotation.quotationNo,
                    currency: quotation.currency,
                    estimatedCost: estimate.costTotal,
                    estimatedProfit: estimate.profit,
                    comparable: quotation.currency === record.currency && estimate.costTotal !== null && summary.costTotal !== null,
                    costDifference: quotation.currency === record.currency && estimate.costTotal !== null && summary.costTotal !== null
                        ? Math.round((summary.costTotal - estimate.costTotal) * 100) / 100
                        : null,
                };
            }
        }

        return res.json({ record, items, summary, linkedEstimate });
    } catch (error) {
        console.error("Cost overview failed:", error);
        return res.status(500).json({ message: "Failed to load cost overview." });
    }
};

const addCost = async (req, res) => {
    const recordType = TYPES[req.params.type];
    const recordId = req.params.id;
    if (!recordType || !validId(recordId)) {
        return res.status(400).json({ message: "Choose a valid quotation or booking." });
    }
    try {
        const record = await loadRecord(recordType, recordId);
        if (!record) return res.status(404).json({ message: "Quotation or booking not found." });
        const payload = parseCostPayload(req.body, record.currency);
        if (payload.error) return res.status(400).json({ message: payload.error });

        const item = await CostEntry.create({
            ...payload.value,
            recordType,
            recordId,
            createdBy: req.admin._id,
        });
        await createActivityLog({
            req, action: "CREATE", module: "Other",
            description: `Supplier cost entry created for ${recordType.toLowerCase()} ${record.reference}`,
            relatedRecordId: recordId, relatedModel: recordType, referenceNo: record.reference,
        });
        return res.status(201).json(item);
    } catch (error) {
        console.error("Cost entry creation failed:", error);
        return res.status(500).json({ message: "Failed to save cost entry." });
    }
};

const updateCost = async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid cost entry." });
    try {
        const item = await CostEntry.findById(req.params.id);
        if (!item) return res.status(404).json({ message: "Cost entry not found." });
        const record = await loadRecord(item.recordType, item.recordId);
        if (!record) return res.status(404).json({ message: "Quotation or booking not found." });
        const payload = parseCostPayload(req.body, record.currency);
        if (payload.error) return res.status(400).json({ message: payload.error });

        Object.assign(item, payload.value);
        await item.save();
        await createActivityLog({
            req, action: "UPDATE", module: "Other",
            description: `Supplier cost entry updated for ${item.recordType.toLowerCase()} ${record.reference}`,
            relatedRecordId: item.recordId, relatedModel: item.recordType, referenceNo: record.reference,
        });
        return res.json(item);
    } catch (error) {
        console.error("Cost entry update failed:", error);
        return res.status(500).json({ message: "Failed to update cost entry." });
    }
};

const deleteCost = async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid cost entry." });
    try {
        const item = await CostEntry.findById(req.params.id);
        if (!item) return res.status(404).json({ message: "Cost entry not found." });
        const record = await loadRecord(item.recordType, item.recordId);
        if (!record) return res.status(404).json({ message: "Quotation or booking not found." });
        await item.deleteOne();
        await createActivityLog({
            req, action: "DELETE", module: "Other",
            description: `Supplier cost entry deleted for ${item.recordType.toLowerCase()} ${record.reference}`,
            relatedRecordId: item.recordId, relatedModel: item.recordType, referenceNo: record.reference,
        });
        return res.json({ message: "Cost entry deleted." });
    } catch (error) {
        console.error("Cost entry deletion failed:", error);
        return res.status(500).json({ message: "Failed to delete cost entry." });
    }
};

module.exports = { getCostOverview, addCost, updateCost, deleteCost };
