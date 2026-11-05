const Quotation = require("../models/Quotation");
const Booking = require("../models/Booking");
const CostEntry = require("../models/CostEntry");
const Supplier = require("../models/Supplier");
const SupplierRate = require("../models/SupplierRate");
const { createActivityLog } = require("../utils/createActivityLog");
const { costSummary, parseCostPayload } = require("../utils/costProfit");
const { parseRateSelection, buildRateEstimate } = require("../utils/rateEstimate");
const { getBusinessDayBounds } = require("../utils/businessDate");
const { parseSupplierPayment, unitemizedPaidCents } = require("../utils/supplierPayment");
const { parseSupplierScheduleQuery } = require("../utils/supplierSchedule");
const { parseSupplierReconciliation } = require("../utils/supplierReconciliation");
const {
    MAX_EXPORT_ROWS, parseSupplierPaymentRegisterQuery, registerSort, registerProject, supplierPaymentsCsv,
} = require("../utils/supplierPaymentRegister");

const TYPES = { quotation: "Quotation", booking: "Booking" };
const validId = (id) => /^[0-9a-f]{24}$/i.test(String(id || ""));
const DAY_MS = 24 * 60 * 60 * 1000;

const loadRecord = async (recordType, recordId) => {
    if (recordType === "Quotation") {
        const record = await Quotation.findById(recordId).select("quotationNo clientName tourTitle currency totals booking travelStartDate travelEndDate");
        return record && {
            id: record._id,
            reference: record.quotationNo,
            customerName: record.clientName,
            title: record.tourTitle,
            currency: record.currency,
            saleAmount: record.totals?.grandTotal || 0,
            bookingId: record.booking || null,
            travelStartDate: record.travelStartDate || null,
            travelEndDate: record.travelEndDate || null,
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

const withBookingDetails = async (costs) => {
    const bookings = await Booking.find({ _id: { $in: costs.map((cost) => cost.recordId) } })
        .select("bookingCode customer.fullName bookingStatus").lean();
    const byId = new Map(bookings.map((booking) => [String(booking._id), booking]));
    return costs.filter((cost) => byId.has(String(cost.recordId))).map((cost) => ({
        _id: cost._id,
        recordId: cost.recordId,
        description: cost.description,
        currency: cost.currency,
        amount: cost.amount,
        paidAmount: cost.paidAmount ?? 0,
        remaining: Math.round((cost.amount - (cost.paidAmount ?? 0)) * 100) / 100,
        paymentDueDate: cost.paymentDueDate,
        bookingCode: byId.get(String(cost.recordId)).bookingCode,
        customerName: byId.get(String(cost.recordId)).customer?.fullName || "",
        bookingStatus: byId.get(String(cost.recordId)).bookingStatus,
    }));
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

// Booking supplier payments due today, overdue, or within the next six days.
// Amounts stay in each supplier's currency; never add different currencies together.
const getSupplierPayables = async (req, res) => {
    try {
        const { start } = getBusinessDayBounds();
        const nextWeek = new Date(start.getTime() + 7 * DAY_MS);
        const query = {
            recordType: "Booking",
            paymentDueDate: { $ne: null, $lt: nextWeek },
            $expr: { $lt: [{ $ifNull: ["$paidAmount", 0] }, "$amount"] },
        };
        const [costs, total, overdue] = await Promise.all([
            CostEntry.find(query).select("recordId description currency amount paidAmount paymentDueDate")
                .sort({ paymentDueDate: 1, _id: 1 }).limit(50).lean(),
            CostEntry.countDocuments(query),
            CostEntry.countDocuments({ ...query, paymentDueDate: { $ne: null, $lt: start } }),
        ]);
        return res.json({
            total,
            limit: 50,
            summary: { total, overdue, upcoming: total - overdue },
            items: await withBookingDetails(costs),
        });
    } catch (error) {
        console.error("Supplier payables failed:", error);
        return res.status(500).json({ message: "Failed to load supplier payments." });
    }
};

const getSupplierSchedule = async (req, res) => {
    const parsed = parseSupplierScheduleQuery(req.query);
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    const { filter, page, limit, query } = parsed.value;
    try {
        const [costs, total, totalsByCurrency] = await Promise.all([
            CostEntry.find(query).select("recordId description currency amount paidAmount paymentDueDate")
                .sort({ paymentDueDate: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
            CostEntry.countDocuments(query),
            CostEntry.aggregate([
                { $match: query },
                { $group: { _id: "$currency", remaining: { $sum: { $subtract: ["$amount", { $ifNull: ["$paidAmount", 0] }] } } } },
                { $project: { _id: 0, currency: "$_id", remaining: { $round: ["$remaining", 2] } } },
                { $sort: { currency: 1 } },
            ]),
        ]);
        return res.json({
            filter, page, limit, total, pages: Math.ceil(total / limit), totalsByCurrency,
            items: await withBookingDetails(costs),
        });
    } catch (error) {
        console.error("Supplier schedule failed:", error);
        return res.status(500).json({ message: "Failed to load supplier payment schedule." });
    }
};

const getSupplierPaymentRegister = async (req, res) => {
    const parsed = parseSupplierPaymentRegisterQuery(req.query);
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    const { from, to, reference, status, acknowledgement, page, limit, stages } = parsed.value;
    try {
        const [result] = await CostEntry.aggregate([
            ...stages,
            { $facet: {
                items: [
                    { $sort: registerSort }, { $skip: (page - 1) * limit }, { $limit: limit },
                    { $project: registerProject },
                ],
                count: [{ $count: "total" }],
                totalsByCurrency: [
                    { $group: { _id: "$currency", amount: { $sum: "$paymentHistory.amount" } } },
                    { $project: { _id: 0, currency: "$_id", amount: { $round: ["$amount", 2] } } },
                    { $sort: { currency: 1 } },
                ],
            } },
        ]);
        const total = result.count[0]?.total || 0;
        return res.json({ from, to, reference, status, acknowledgement, page, limit, total, pages: Math.ceil(total / limit),
            totalsByCurrency: result.totalsByCurrency, items: result.items });
    } catch (error) {
        console.error("Supplier payment register failed:", error);
        return res.status(500).json({ message: "Failed to load supplier payment register." });
    }
};

const exportSupplierPaymentRegister = async (req, res) => {
    const parsed = parseSupplierPaymentRegisterQuery(req.query);
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    const { from, to, stages } = parsed.value;
    try {
        const items = await CostEntry.aggregate([
            ...stages, { $sort: registerSort }, { $limit: MAX_EXPORT_ROWS + 1 }, { $project: registerProject },
        ]);
        if (items.length > MAX_EXPORT_ROWS) {
            return res.status(413).json({ message: "More than 10,000 payments match. Narrow the date range or reference to export." });
        }
        res.set("Content-Disposition", `attachment; filename="supplier-payments-${from}-to-${to}.csv"`);
        return res.type("text/csv").send(`\uFEFF${supplierPaymentsCsv(items)}`);
    } catch (error) {
        console.error("Supplier payment export failed:", error);
        return res.status(500).json({ message: "Failed to export supplier payments." });
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
        const payload = parseCostPayload(req.body, record.currency, recordType);
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

const addQuotationCostFromRate = async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ message: "Choose a valid quotation." });
    const selection = parseRateSelection(req.body);
    if (selection.error) return res.status(400).json({ message: selection.error });
    res.setHeader("Cache-Control", "no-store");
    try {
        const quotation = await loadRecord("Quotation", req.params.id);
        if (!quotation) return res.status(404).json({ message: "Quotation not found." });
        const supplier = await Supplier.findById(req.body.supplierId).select("name category status");
        if (!supplier) return res.status(404).json({ message: "Supplier not found." });
        // The selected version must still be current when staff apply it.
        const rate = await SupplierRate.findOne({ _id: req.body.rateId, supplier: supplier._id,
            __v: req.body.expectedVersion });
        if (!rate) return res.status(409).json({ message: "This supplier rate changed. Refresh and review it before applying." });
        const estimate = buildRateEstimate(selection.value, supplier, rate, quotation, req.body.conversionRate);
        if (estimate.error) return res.status(400).json({ message: estimate.error });
        const item = await CostEntry.create({ ...estimate.value, recordType: "Quotation", recordId: quotation.id,
            createdBy: req.admin._id });
        await createActivityLog({ req, action: "CREATE", module: "Other",
            description: `Supplier rate applied to quotation estimate ${quotation.reference}`,
            relatedRecordId: quotation.id, relatedModel: "Quotation", referenceNo: quotation.reference });
        return res.status(201).json(item);
    } catch (error) {
        console.error("Quotation rate estimate failed:", error);
        return res.status(500).json({ message: "Failed to save the quotation estimate." });
    }
};

const updateCost = async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid cost entry." });
    try {
        const item = await CostEntry.findById(req.params.id);
        if (!item) return res.status(404).json({ message: "Cost entry not found." });
        const record = await loadRecord(item.recordType, item.recordId);
        if (!record) return res.status(404).json({ message: "Quotation or booking not found." });
        const payload = parseCostPayload(req.body, record.currency, item.recordType, item);
        if (payload.error) return res.status(400).json({ message: payload.error });

        if (item.rateSource && ["category", "description", "amount", "currency", "conversionRate", "targetCurrency"]
            .some((field) => item[field] !== payload.value[field])) item.rateSource.manuallyEdited = true;

        const previousPaid = item.paidAmount ?? 0;
        const deltaCents = item.recordType === "Booking"
            ? Math.round((payload.value.paidAmount - previousPaid) * 100) : 0;
        if (deltaCents !== 0) {
            const note = req.body?.adjustmentNote ?? "";
            if (typeof note !== "string" || note.trim().length > 300) {
                return res.status(400).json({ message: "Payment correction note must be at most 300 characters." });
            }
            item.paymentHistory.push({
                kind: "adjustment", amount: deltaCents / 100,
                paidAmountAfter: payload.value.paidAmount,
                note: note.trim() || "Paid total corrected manually",
                recordedBy: req.admin._id, recordedByName: String(req.admin.name || "Staff").slice(0, 100),
            });
        }
        Object.assign(item, payload.value);
        await item.save();
        await createActivityLog({
            req, action: "UPDATE", module: "Other",
            description: `Supplier cost entry updated for ${item.recordType.toLowerCase()} ${record.reference}`,
            relatedRecordId: item.recordId, relatedModel: item.recordType, referenceNo: record.reference,
        });
        return res.json(item);
    } catch (error) {
        if (error.name === "VersionError" || error.name === "DocumentNotFoundError") {
            return res.status(409).json({ message: "This cost changed while you were editing it. Refresh and try again." });
        }
        console.error("Cost entry update failed:", error);
        return res.status(500).json({ message: "Failed to update cost entry." });
    }
};

const recordSupplierPayment = async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid cost entry." });
    try {
        const item = await CostEntry.findById(req.params.id);
        if (!item) return res.status(404).json({ message: "Cost entry not found." });
        if (item.recordType !== "Booking") {
            return res.status(400).json({ message: "Only booking costs can have supplier payments." });
        }
        const record = await loadRecord("Booking", item.recordId);
        if (!record) return res.status(404).json({ message: "Booking not found." });
        const payment = parseSupplierPayment(req.body, item.amount - (item.paidAmount ?? 0));
        if (payment.error) return res.status(400).json({ message: payment.error });

        item.paidAmount = Math.round(((item.paidAmount ?? 0) + payment.value.amount) * 100) / 100;
        item.paymentHistory.push({
            kind: "payment", ...payment.value, paidAmountAfter: item.paidAmount,
            recordedBy: req.admin._id, recordedByName: String(req.admin.name || "Staff").slice(0, 100),
        });
        await item.save();
        await createActivityLog({
            req, action: "UPDATE", module: "Other",
            description: `Supplier payment recorded for booking ${record.reference}`,
            relatedRecordId: item.recordId, relatedModel: "Booking", referenceNo: record.reference,
        });
        return res.status(201).json({ paidAmount: item.paidAmount, payment: item.paymentHistory.at(-1) });
    } catch (error) {
        if (error.name === "VersionError" || error.name === "DocumentNotFoundError") {
            return res.status(409).json({ message: "This cost changed while recording the payment. Refresh and try again." });
        }
        console.error("Supplier payment recording failed:", error);
        return res.status(500).json({ message: "Failed to record supplier payment." });
    }
};

const documentExistingSupplierPayment = async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid cost entry." });
    res.setHeader("Cache-Control", "no-store");
    try {
        const item = await CostEntry.findById(req.params.id);
        if (!item) return res.status(404).json({ message: "Cost entry not found." });
        if (item.recordType !== "Booking") return res.status(400).json({ message: "Only booking costs can have supplier payments." });
        const record = await loadRecord("Booking", item.recordId);
        if (!record) return res.status(404).json({ message: "Booking not found." });
        if (!Number.isSafeInteger(req.body?.expectedVersion) || req.body.expectedVersion < 0) {
            return res.status(400).json({ message: "Refresh the cost before documenting this payment." });
        }
        if (req.body.expectedVersion !== item.__v) {
            return res.status(409).json({ message: "This cost changed. Refresh and review the unitemized amount." });
        }
        if (req.body.confirmed !== true) {
            return res.status(400).json({ message: "Confirm that this payment is already included in the paid total and matches your bank record." });
        }
        const availableCents = unitemizedPaidCents(item);
        if (availableCents <= 0) {
            return res.status(409).json({ message: "There is no unitemized paid amount left on this cost." });
        }
        const payment = parseSupplierPayment(req.body, availableCents / 100);
        if (payment.error) return res.status(400).json({ message: payment.error });
        if (["Bank transfer", "Card"].includes(payment.value.method) && !payment.value.reference) {
            return res.status(400).json({ message: "Enter the bank or card transaction reference from the payment confirmation." });
        }

        item.paymentHistory.push({
            kind: "payment", allocatedFromPaidTotal: true, ...payment.value,
            paidAmountAfter: item.paidAmount,
            recordedBy: req.admin._id, recordedByName: String(req.admin.name || "Staff").slice(0, 100),
        });
        await item.save();
        await createActivityLog({
            req, action: "UPDATE", module: "Other",
            description: `Existing supplier paid total itemized for booking ${record.reference}`,
            relatedRecordId: item.recordId, relatedModel: "Booking", referenceNo: record.reference,
        });
        return res.status(201).json({ paidAmount: item.paidAmount, payment: item.paymentHistory.at(-1) });
    } catch (error) {
        if (error.name === "VersionError" || error.name === "DocumentNotFoundError") {
            return res.status(409).json({ message: "This cost changed. Refresh and review the unitemized amount." });
        }
        console.error("Supplier payment documentation failed:", error);
        return res.status(500).json({ message: "Failed to document existing supplier payment." });
    }
};

const reconcileSupplierPayment = async (req, res) => {
    if (!validId(req.params.id) || !validId(req.params.paymentId)) {
        return res.status(400).json({ message: "Choose a valid supplier payment." });
    }
    const parsed = parseSupplierReconciliation(req.body);
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    try {
        const item = await CostEntry.findById(req.params.id);
        if (!item) return res.status(404).json({ message: "Cost entry not found." });
        if (item.recordType !== "Booking") return res.status(400).json({ message: "Only booking payments can be reconciled." });
        const payment = item.paymentHistory.id(req.params.paymentId);
        if (!payment || payment.kind !== "payment") {
            return res.status(404).json({ message: "Supplier payment not found." });
        }
        const booking = await loadRecord("Booking", item.recordId);
        if (!booking) return res.status(404).json({ message: "Booking not found." });
        if (Boolean(payment.reconciledAt) === parsed.value.reconciled) {
            return res.status(409).json({ message: "This payment status has changed. Refresh the register and try again." });
        }

        const recordedAt = new Date();
        const recordedByName = String(req.admin.name || "Staff").slice(0, 100);
        payment.reconciliationHistory.push({
            action: parsed.value.reconciled ? "reconciled" : "reopened",
            statementReference: parsed.value.reconciled ? parsed.value.statementReference : payment.statementReference,
            reason: parsed.value.reason || "", recordedBy: req.admin._id, recordedByName, recordedAt,
        });
        payment.reconciledAt = parsed.value.reconciled ? recordedAt : null;
        payment.statementReference = parsed.value.reconciled ? parsed.value.statementReference : "";
        payment.reconciledBy = parsed.value.reconciled ? req.admin._id : null;
        payment.reconciledByName = parsed.value.reconciled ? recordedByName : "";
        await item.save();
        await createActivityLog({
            req, action: "UPDATE", module: "Other",
            description: `Supplier payment ${parsed.value.reconciled ? "reconciled" : "reopened"} for booking ${booking.reference}`,
            relatedRecordId: item.recordId, relatedModel: "Booking", referenceNo: booking.reference,
        });
        return res.json({ payment });
    } catch (error) {
        if (error.name === "VersionError" || error.name === "DocumentNotFoundError") {
            return res.status(409).json({ message: "This payment changed while you were updating it. Refresh and try again." });
        }
        console.error("Supplier payment reconciliation failed:", error);
        return res.status(500).json({ message: "Failed to update supplier payment reconciliation." });
    }
};

const deleteCost = async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid cost entry." });
    try {
        const item = await CostEntry.findById(req.params.id);
        if (!item) return res.status(404).json({ message: "Cost entry not found." });
        const record = await loadRecord(item.recordType, item.recordId);
        if (!record) return res.status(404).json({ message: "Quotation or booking not found." });
        if (item.recordType === "Booking") {
            if ((item.paidAmount ?? 0) > 0 || item.paymentHistory?.length > 0) {
                return res.status(409).json({ message: "A cost with recorded supplier payments cannot be deleted." });
            }
            const result = await CostEntry.deleteOne({
                _id: item._id,
                $or: [{ paidAmount: 0 }, { paidAmount: { $exists: false } }],
                "paymentHistory.0": { $exists: false },
            });
            if (!result.deletedCount) return res.status(409).json({ message: "This cost changed. Refresh and try again." });
        } else {
            await item.deleteOne();
        }
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

module.exports = { getCostOverview, getSupplierPayables, getSupplierSchedule, getSupplierPaymentRegister, exportSupplierPaymentRegister,
    addCost, addQuotationCostFromRate, updateCost, recordSupplierPayment, documentExistingSupplierPayment, reconcileSupplierPayment, deleteCost };
