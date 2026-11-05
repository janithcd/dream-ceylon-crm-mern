const { createHash } = require("node:crypto");
const CostEntry = require("../models/CostEntry");
const Booking = require("../models/Booking");
const SupplierInvoice = require("../models/SupplierInvoice");
const { createActivityLog } = require("../utils/createActivityLog");
const { validId } = require("../utils/supplierPaymentContext");
const { parsePrivateFile } = require("../utils/supplierPaymentEvidence");
const { parseInvoiceDetails, parseInvoiceReview, parseInvoiceVoid, invoiceView } = require("../utils/supplierInvoice");

const issue = (status, message) => Object.assign(new Error(message), { status });
const respond = (res, error) => {
    if (error.status) return res.status(error.status).json({ message: error.message });
    if (["VersionError", "DocumentNotFoundError"].includes(error.name) || error.code === 11000) {
        return res.status(409).json({ message: "This invoice changed or its reference already exists. Reload and review it." });
    }
    console.error("Supplier invoice action failed:", error.message);
    return res.status(500).json({ message: "Could not update the supplier invoice." });
};
const loadCost = async (req) => {
    if (!validId(req.params.id)) throw issue(400, "Choose a valid booking supplier cost.");
    const cost = await CostEntry.findById(req.params.id);
    if (!cost) throw issue(404, "Cost entry not found.");
    if (cost.recordType !== "Booking") throw issue(400, "Only booking costs have supplier invoices.");
    const booking = await Booking.findById(cost.recordId).select("bookingCode");
    if (!booking) throw issue(404, "Booking not found.");
    return { cost, booking };
};
const audit = (req, { cost, booking }, description) => createActivityLog({ req, action: "UPDATE", module: "Other",
    description: `${description} for booking ${booking.bookingCode}`,
    relatedRecordId: cost.recordId, relatedModel: "Booking", referenceNo: booking.bookingCode });
const actor = (req) => ({ reviewedBy: req.admin._id, reviewedByName: String(req.admin.name || "Staff").slice(0, 100), reviewedAt: new Date() });

const listSupplierInvoices = async (req, res) => {
    try {
        const { cost } = await loadCost(req);
        const page = req.query.page ?? "1";
        if (typeof page !== "string" || !/^[1-9]\d*$/.test(page) || Number(page) > 10000) throw issue(400, "Choose a valid invoice page.");
        const query = { cost: cost._id };
        const [items, total] = await Promise.all([
            SupplierInvoice.find(query).sort({ createdAt: -1, _id: -1 }).skip((Number(page) - 1) * 20).limit(20).lean(),
            SupplierInvoice.countDocuments(query),
        ]);
        return res.json({ items: items.map(invoiceView), page: Number(page), pages: Math.ceil(total / 20), total,
            cost: { amount: cost.amount, currency: cost.currency, paymentDueDate: cost.paymentDueDate,
                paidAmount: cost.paidAmount ?? 0, description: cost.description } });
    } catch (error) { return respond(res, error); }
};

const createSupplierInvoice = async (req, res) => {
    try {
        const context = await loadCost(req);
        const parsed = parseInvoiceDetails(req.body);
        if (parsed.error) throw issue(400, parsed.error);
        await SupplierInvoice.init();
        const invoice = await SupplierInvoice.create({ ...parsed.value, cost: context.cost._id,
            booking: context.cost.recordId, createdBy: req.admin._id,
            createdByName: String(req.admin.name || "Staff").slice(0, 100) });
        await audit(req, context, "Supplier invoice recorded");
        return res.status(201).json({ invoice: invoiceView(invoice) });
    } catch (error) { return respond(res, error); }
};

const loadInvoice = async (req, cost, withData = false) => {
    if (!validId(req.params.invoiceId)) throw issue(400, "Choose a valid supplier invoice.");
    const query = SupplierInvoice.findOne({ _id: req.params.invoiceId, cost: cost._id });
    const invoice = await (withData ? query.select("+data +sha256") : query);
    if (!invoice) throw issue(404, "Invoice not found for this booking cost.");
    return invoice;
};

const uploadSupplierInvoiceFile = async (req, res) => {
    try {
        const context = await loadCost(req);
        const parsed = parsePrivateFile({ data: req.body,
            contentType: req.get("Content-Type")?.split(";")[0].trim().toLowerCase(), encodedName: req.get("X-File-Name") });
        if (parsed.error) throw issue(parsed.status, parsed.error);
        const invoice = await loadInvoice(req, context.cost, true);
        if (invoice.voidedAt) throw issue(410, "This invoice was voided. Create a new record for a corrected document.");
        if (invoice.filename || invoice.status !== "Received") throw issue(409, "This invoice already has a file. Void it and create a corrected record if necessary.");
        if (!/^(0|[1-9]\d*)$/.test(String(req.query.expectedVersion ?? "")) || Number(req.query.expectedVersion) !== invoice.__v) {
            throw issue(409, "This invoice changed. Reload it before attaching the file.");
        }
        Object.assign(invoice, parsed.value);
        await invoice.save();
        await audit(req, context, "Supplier invoice file attached");
        return res.status(201).json({ invoice: invoiceView(invoice) });
    } catch (error) { return respond(res, error); }
};

const downloadSupplierInvoiceFile = async (req, res) => {
    try {
        const context = await loadCost(req);
        const invoice = await loadInvoice(req, context.cost, true);
        if (invoice.voidedAt) throw issue(410, "This invoice was voided. Use the current invoice record.");
        if (!invoice.filename || !invoice.data) throw issue(404, "No file is attached to this invoice.");
        const bytes = Buffer.from(invoice.data);
        if (bytes.length !== invoice.size || createHash("sha256").update(bytes).digest("hex") !== invoice.sha256) {
            throw issue(409, "The stored invoice file needs review. Upload a verified replacement record.");
        }
        const fallback = invoice.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
        const encoded = encodeURIComponent(invoice.filename).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Disposition", `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`);
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Content-Security-Policy", "sandbox");
        return res.send(bytes);
    } catch (error) { return respond(res, error); }
};

const reviewSupplierInvoice = async (req, res) => {
    try {
        const context = await loadCost(req);
        const parsed = parseInvoiceReview(req.body);
        if (parsed.error) throw issue(400, parsed.error);
        const invoice = await loadInvoice(req, context.cost);
        if (invoice.voidedAt) throw issue(410, "This invoice was voided.");
        if (invoice.__v !== req.body.expectedVersion) throw issue(409, "This invoice changed. Reload before reviewing it.");
        if (!invoice.filename) throw issue(400, "Attach the supplier's invoice document before reviewing it.");
        if (invoice.status === parsed.value.status) throw issue(409, "This invoice already has that review status.");
        if (parsed.value.status === "Approved" &&
            (invoice.amount !== context.cost.amount || invoice.currency !== context.cost.currency) && req.body.confirmedDifference !== true) {
            throw issue(400, "The invoice differs from the booking cost. Confirm that you reviewed the amount and currency difference.");
        }
        invoice.status = parsed.value.status;
        invoice.reviewHistory.push({ ...parsed.value, ...actor(req) });
        await invoice.save();
        await audit(req, context, `Supplier invoice ${invoice.status.toLowerCase()}`);
        return res.json({ invoice: invoiceView(invoice) });
    } catch (error) { return respond(res, error); }
};

const voidSupplierInvoice = async (req, res) => {
    try {
        const context = await loadCost(req);
        const parsed = parseInvoiceVoid(req.body);
        if (parsed.error) throw issue(400, parsed.error);
        const invoice = await loadInvoice(req, context.cost);
        if (invoice.voidedAt) throw issue(409, "This invoice is already voided.");
        if (invoice.__v !== req.body.expectedVersion) throw issue(409, "This invoice changed. Reload before voiding it.");
        invoice.voidedAt = new Date(); invoice.voidedBy = req.admin._id;
        invoice.voidedByName = String(req.admin.name || "Staff").slice(0, 100); invoice.voidReason = parsed.value;
        await invoice.save();
        await audit(req, context, "Supplier invoice voided");
        return res.json({ invoice: invoiceView(invoice) });
    } catch (error) { return respond(res, error); }
};

module.exports = { listSupplierInvoices, createSupplierInvoice, uploadSupplierInvoiceFile,
    downloadSupplierInvoiceFile, reviewSupplierInvoice, voidSupplierInvoice };
