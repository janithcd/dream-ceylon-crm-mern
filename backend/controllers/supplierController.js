const Supplier = require("../models/Supplier");
const { parseSupplier, parseSupplierList } = require("../utils/supplierDirectory");
const { createActivityLog } = require("../utils/createActivityLog");

const validId = (id) => /^[a-f\d]{24}$/i.test(String(id || ""));
const fields = "category name location contactName email phone whatsapp terms notes status createdAt updatedAt __v";
const present = (supplier) => {
    const data = supplier.toObject();
    return Object.fromEntries(["_id", ...fields.split(" ")].map((field) => [field, data[field]]));
};
const handleError = (res, error) => {
    if (error.code === 11000) return res.status(409).json({ message: "A supplier with this name and location already exists in this category." });
    if (["VersionError", "DocumentNotFoundError"].includes(error.name)) return res.status(409).json({ message: "This supplier changed. Reload and review the latest details." });
    console.error("Supplier directory failed:", error);
    return res.status(500).json({ message: "Could not save supplier details." });
};
const log = (req, action, supplier) => createActivityLog({ req, action, module: "Other",
    description: `Supplier directory ${action.toLowerCase()}: ${supplier.category} ${supplier.name}`,
    relatedRecordId: supplier._id, relatedModel: "Supplier" });

const listSuppliers = async (req, res) => {
    const parsed = parseSupplierList(req.query);
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    const { query, page, limit } = parsed.value;
    res.setHeader("Cache-Control", "no-store");
    try {
        const [items, total] = await Promise.all([
            Supplier.find(query).select(fields).sort({ name: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
            Supplier.countDocuments(query),
        ]);
        return res.json({ items, total, page, limit, pages: Math.ceil(total / limit) });
    } catch (error) {
        console.error("Supplier directory list failed:", error);
        return res.status(500).json({ message: "Could not load suppliers." });
    }
};

const createSupplier = async (req, res) => {
    const parsed = parseSupplier(req.body);
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    try {
        const supplier = await Supplier.create({ ...parsed.value, createdBy: req.admin._id, updatedBy: req.admin._id });
        await log(req, "CREATE", supplier);
        return res.status(201).json(present(supplier));
    } catch (error) { return handleError(res, error); }
};

const updateSupplier = async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid supplier ID." });
    const parsed = parseSupplier(req.body);
    if (parsed.error || !Number.isSafeInteger(req.body?.expectedVersion) || req.body.expectedVersion < 0) {
        return res.status(400).json({ message: parsed.error || "Reload this supplier before saving changes." });
    }
    try {
        const supplier = await Supplier.findById(req.params.id);
        if (!supplier) return res.status(404).json({ message: "Supplier not found." });
        if (supplier.__v !== req.body.expectedVersion) return res.status(409).json({ message: "This supplier changed. Reload and review the latest details." });
        Object.assign(supplier, parsed.value, { updatedBy: req.admin._id });
        await supplier.save();
        await log(req, "UPDATE", supplier);
        return res.json(present(supplier));
    } catch (error) { return handleError(res, error); }
};

module.exports = { listSuppliers, createSupplier, updateSupplier };
