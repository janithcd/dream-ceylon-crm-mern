const { createHash } = require("node:crypto");
const Attachment = require("../models/SupplierPaymentAttachment");
const { createActivityLog } = require("../utils/createActivityLog");
const { paymentError, validId, loadSupplierPayment, supplierPaymentErrorResponse } = require("../utils/supplierPaymentContext");
const { parsePaymentFile, parseAcknowledgement, cleanField, attachmentMetadata } = require("../utils/supplierPaymentEvidence");

const owner = ({ cost, payment }) => ({ cost: cost._id, paymentId: payment._id });
const audit = (req, context, action, description) => createActivityLog({ req, action, module: "Other",
    description: `${description} for booking ${context.booking.bookingCode}`,
    relatedRecordId: context.cost.recordId, relatedModel: "Booking", referenceNo: context.booking.bookingCode });

const listPaymentAttachments = async (req, res) => {
    try {
        const context = await loadSupplierPayment(req);
        const rawPage = req.query.historyPage ?? "1";
        if (typeof rawPage !== "string" || !/^[1-9]\d*$/.test(rawPage) || Number(rawPage) > 10000) throw paymentError(400, "Choose a valid attachment history page.");
        const page = Number(rawPage), limit = 10;
        const base = owner(context), archived = { ...base, withdrawnAt: { $ne: null } };
        const [active, history, total] = await Promise.all([
            Attachment.find({ ...base, withdrawnAt: null }).sort({ uploadedAt: -1, _id: -1 }).limit(5).lean(),
            Attachment.find(archived).sort({ withdrawnAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
            Attachment.countDocuments(archived),
        ]);
        return res.json({ active: active.map(attachmentMetadata), history: history.map(attachmentMetadata),
            page, pages: Math.ceil(total / limit), total });
    } catch (error) { return supplierPaymentErrorResponse(res, error); }
};

const uploadPaymentAttachment = async (req, res) => {
    try {
        const context = await loadSupplierPayment(req);
        const parsed = parsePaymentFile({ data: req.body, contentType: req.get("Content-Type")?.split(";")[0].trim().toLowerCase(),
            encodedName: req.get("X-File-Name"), kind: req.query.kind });
        if (parsed.error) throw paymentError(parsed.status, parsed.error);
        await Attachment.init(); // The unique active slots enforce the limit even across concurrent API processes.
        const active = await Attachment.find({ ...owner(context), withdrawnAt: null }).select("slot").lean();
        const slot = [1, 2, 3, 4, 5].find((value) => !active.some((doc) => doc.slot === value));
        if (!slot) throw paymentError(409, "This payment already has five active attachments. Withdraw an incorrect file before adding another.");
        const doc = await Attachment.create({ ...owner(context), ...parsed.value, slot,
            uploadedBy: req.admin._id, uploadedByName: String(req.admin.name || "Staff").slice(0, 100) });
        await audit(req, context, "CREATE", "Supplier payment attachment added");
        return res.status(201).json({ attachment: attachmentMetadata(doc) });
    } catch (error) { return supplierPaymentErrorResponse(res, error); }
};

const downloadPaymentAttachment = async (req, res) => {
    try {
        if (!validId(req.params.attachmentId)) throw paymentError(400, "Choose a valid payment attachment.");
        const context = await loadSupplierPayment(req);
        const doc = await Attachment.findOne({ ...owner(context), _id: req.params.attachmentId }).select("+data");
        if (!doc) throw paymentError(404, "Attachment not found for this payment.");
        if (doc.withdrawnAt) throw paymentError(410, "This attachment was withdrawn. Use the current files on this payment.");
        const bytes = Buffer.from(doc.data);
        if (bytes.length !== doc.size || createHash("sha256").update(bytes).digest("hex") !== doc.sha256) throw paymentError(409, "The stored attachment needs review. Upload a verified copy.");
        const fallback = doc.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
        const encoded = encodeURIComponent(doc.filename).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Disposition", `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`);
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Content-Security-Policy", "sandbox");
        return res.send(bytes);
    } catch (error) { return supplierPaymentErrorResponse(res, error); }
};

const withdrawPaymentAttachment = async (req, res) => {
    try {
        if (!validId(req.params.attachmentId)) throw paymentError(400, "Choose a valid payment attachment.");
        if (!cleanField(req.body?.reason, 300, 3)) throw paymentError(400, "Enter a reason for withdrawing the attachment (3–300 characters).");
        const context = await loadSupplierPayment(req);
        const doc = await Attachment.findOneAndUpdate({ ...owner(context), _id: req.params.attachmentId, withdrawnAt: null },
            { $set: { withdrawnAt: new Date(), withdrawnBy: req.admin._id,
                withdrawnByName: String(req.admin.name || "Staff").slice(0, 100), withdrawalReason: req.body.reason.trim() } },
            { returnDocument: "after", runValidators: true });
        if (!doc) throw paymentError(409, "The attachment is missing or already withdrawn. Reload the file list.");
        await audit(req, context, "UPDATE", "Supplier payment attachment withdrawn");
        return res.json({ attachment: attachmentMetadata(doc) });
    } catch (error) { return supplierPaymentErrorResponse(res, error); }
};

const acknowledgementView = ({ cost, payment, booking }) => ({ version: cost.__v ?? 0, paymentDate: payment.paymentDate, bookingCode: booking.bookingCode,
    current: payment.supplierAcknowledgement || null, history: payment.acknowledgementHistory || [] });
const getPaymentAcknowledgement = async (req, res) => {
    try { return res.json(acknowledgementView(await loadSupplierPayment(req))); }
    catch (error) { return supplierPaymentErrorResponse(res, error); }
};
const updatePaymentAcknowledgement = async (req, res) => {
    try {
        const context = await loadSupplierPayment(req);
        const { cost, payment } = context;
        const parsed = parseAcknowledgement(req.body, payment);
        if (parsed.error) throw paymentError(400, parsed.error);
        if (req.body.expectedVersion !== (cost.__v ?? 0)) throw paymentError(409, "This payment changed. Reload and review the latest acknowledgement.");
        const isAcknowledging = parsed.value.action === "acknowledge";
        if (Boolean(payment.supplierAcknowledgement) === isAcknowledging) throw paymentError(409,
            isAcknowledging ? "This payment is already acknowledged. Reopen it with a reason to correct the details." : "This payment is already awaiting acknowledgement.");
        const actor = { recordedAt: new Date(), recordedBy: req.admin._id, recordedByName: String(req.admin.name || "Staff").slice(0, 100) };
        if (isAcknowledging) payment.supplierAcknowledgement = { ...parsed.value, ...actor };
        payment.acknowledgementHistory.push({ action: isAcknowledging ? "acknowledged" : "reopened",
            acknowledgement: payment.supplierAcknowledgement.toObject(), reason: parsed.value.reason || "", ...actor });
        if (!isAcknowledging) payment.supplierAcknowledgement = null;
        await cost.save();
        await audit(req, context, "UPDATE", `Supplier payment acknowledgement ${isAcknowledging ? "recorded" : "reopened"}`);
        return res.json(acknowledgementView(context));
    } catch (error) { return supplierPaymentErrorResponse(res, error); }
};

module.exports = { listPaymentAttachments, uploadPaymentAttachment, downloadPaymentAttachment, withdrawPaymentAttachment,
    getPaymentAcknowledgement, updatePaymentAcknowledgement };
