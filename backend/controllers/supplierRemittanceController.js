const CostEntry = require("../models/CostEntry");
const Booking = require("../models/Booking");
const { getDocumentBrandConfig } = require("../utils/documentSettings");
const { createActivityLog } = require("../utils/createActivityLog");
const { getRemittancePayment, parseRemittanceDetails, voucherNumber, publicRemittance,
    buildRemittanceEmail } = require("../utils/supplierRemittance");
const { createSupplierRemittancePdf } = require("./supplierRemittancePdf");

const fail = (status, message) => Object.assign(new Error(message), { status });
const loadPayment = async (req) => {
    if (![req.params.id, req.params.paymentId].every((id) => /^[a-f\d]{24}$/i.test(id || ""))) {
        throw fail(400, "Choose a valid supplier payment.");
    }
    const cost = await CostEntry.findById(req.params.id);
    if (!cost) throw fail(404, "Cost entry not found.");
    const payment = cost.paymentHistory.id(req.params.paymentId);
    if (!payment || payment.kind !== "payment") throw fail(404, "Individual supplier payment not found.");
    const parsed = getRemittancePayment(cost, payment);
    if (parsed.error) throw fail(409, parsed.error);
    const booking = await Booking.findById(cost.recordId).select("bookingCode");
    if (!booking) throw fail(404, "Booking not found.");
    return { cost, payment, booking, summary: parsed.value };
};

const present = async ({ cost, payment, booking, summary }) => {
    const revisions = payment.remittanceRevisions || [];
    const latest = revisions.at(-1);
    const current = latest ? publicRemittance(payment._id, latest) : null;
    return {
        version: cost.__v ?? 0, bookingCode: booking.bookingCode, costDescription: cost.description,
        payment: summary, voucherNumber: voucherNumber(payment._id), current,
        history: revisions.map((revision) => ({ ...publicRemittance(payment._id, revision),
            recordedByName: revision.recordedByName, changeReason: revision.changeReason })),
        draft: current ? buildRemittanceEmail(current, await getDocumentBrandConfig()) : null,
    };
};

const handleError = (res, error) => {
    if (error.status) return res.status(error.status).json({ message: error.message });
    if (["VersionError", "DocumentNotFoundError"].includes(error.name)) {
        return res.status(409).json({ message: "This payment changed. Reload the voucher and review the latest details before saving." });
    }
    console.error("Supplier payment voucher failed:", error.message);
    return res.status(500).json({ message: "Could not prepare the supplier payment voucher." });
};

const getSupplierRemittance = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try { return res.json(await present(await loadPayment(req))); }
    catch (error) { return handleError(res, error); }
};

const saveSupplierRemittance = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
        const context = await loadPayment(req);
        const { cost, payment, booking, summary } = context;
        if (!Number.isSafeInteger(req.body?.expectedVersion) || req.body.expectedVersion < 0) {
            throw fail(400, "Load the latest voucher before saving.");
        }
        if (req.body.expectedVersion !== (cost.__v ?? 0)) {
            throw fail(409, "This payment changed. Reload the voucher and review the latest details before saving.");
        }
        const revisions = payment.remittanceRevisions;
        const parsed = parseRemittanceDetails(req.body, summary, revisions.length > 0);
        if (parsed.error) throw fail(400, parsed.error);
        revisions.push({ ...parsed.value, revision: revisions.length + 1,
            bookingCode: String(booking.bookingCode || booking._id), paymentDate: summary.paymentDate,
            method: summary.method, issuedAt: new Date(), recordedBy: req.admin._id,
            recordedByName: String(req.admin.name || "Staff").slice(0, 100) });
        await cost.save();
        await createActivityLog({ req, action: "UPDATE", module: "Other",
            description: `Supplier payment voucher saved for booking ${booking.bookingCode}`,
            relatedRecordId: cost.recordId, relatedModel: "Booking", referenceNo: booking.bookingCode,
        });
        return res.status(201).json(await present(context));
    } catch (error) { return handleError(res, error); }
};

const downloadSupplierRemittance = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
        const { cost, payment, booking, summary } = await loadPayment(req);
        const latest = payment.remittanceRevisions?.at(-1);
        if (!latest) throw fail(409, "Review and save the voucher details before downloading.");
        if (req.body?.revision !== latest.revision) throw fail(409, "The voucher has changed. Reload it before downloading.");
        const parsed = parseRemittanceDetails({ ...latest.toObject(), confirmed: true }, summary);
        if (parsed.error) throw fail(409, `Correct the saved voucher before downloading: ${parsed.error}`);
        const voucher = publicRemittance(payment._id, latest);
        const bytes = await createSupplierRemittancePdf(voucher, await getDocumentBrandConfig());
        const filename = `${voucher.voucherNumber}-r${voucher.revision}.pdf`;
        await createActivityLog({ req, action: "GENERATE", module: "PDF",
            description: `Supplier payment voucher generated for booking ${booking.bookingCode}`,
            relatedRecordId: cost.recordId, relatedModel: "Booking", referenceNo: booking.bookingCode,
            metadata: { documentType: "Supplier Payment Voucher", filename },
        });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        return res.send(bytes);
    } catch (error) { return handleError(res, error); }
};

module.exports = { getSupplierRemittance, saveSupplierRemittance, downloadSupplierRemittance };
