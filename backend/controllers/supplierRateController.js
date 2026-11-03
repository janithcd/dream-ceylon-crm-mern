const Supplier = require("../models/Supplier");
const SupplierRate = require("../models/SupplierRate");
const { parseSupplierRate, parseRateList, overlapQuery } = require("../utils/supplierRates");
const { createActivityLog } = require("../utils/createActivityLog");

const validId = (id) => /^[a-f\d]{24}$/i.test(String(id || ""));
const rateFields = ["service", "unit", "mealPlan", "occupancy", "amount", "currency", "validFrom", "validTo",
    "sourceReference", "notes", "status"];
const projection = [...rateFields, "supplier", "revision", "history", "createdAt", "updatedAt", "__v"].join(" ");
const present = (rate) => {
    const data = rate.toObject();
    return Object.fromEntries(["_id", ...projection.split(" ")].map((field) => [field, data[field]]));
};
const changed = (rate, value) => rateFields.some((field) =>
    (rate[field] instanceof Date ? rate[field].getTime() : rate[field]) !==
    (value[field] instanceof Date ? value[field].getTime() : value[field]));
const log = (req, action, supplier) => createActivityLog({ req, action: "UPDATE", module: "Other",
    description: `Supplier rate ${action} for ${supplier.category} ${supplier.name}`,
    relatedRecordId: supplier._id, relatedModel: "Supplier" });
const handleError = (res, error) => {
    if (["VersionError", "DocumentNotFoundError"].includes(error.name)) {
        return res.status(409).json({ message: "This rate changed. Reload and review the latest details." });
    }
    console.error("Supplier rate failed:", error);
    return res.status(500).json({ message: "Could not save supplier rate." });
};
const findSupplier = (id) => Supplier.findById(id).select("category name status");

const listRates = async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid supplier ID." });
    const parsed = parseRateList(req.query);
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    res.setHeader("Cache-Control", "no-store");
    try {
        const supplier = await findSupplier(req.params.id);
        if (!supplier) return res.status(404).json({ message: "Supplier not found." });
        const { filter, page, limit } = parsed.value;
        const query = { supplier: supplier._id, ...filter };
        const [items, total] = await Promise.all([
            SupplierRate.find(query).select(projection).sort({ validFrom: -1, _id: -1 })
                .skip((page - 1) * limit).limit(limit).lean(),
            SupplierRate.countDocuments(query),
        ]);
        return res.json({ items, total, page, limit, pages: Math.ceil(total / limit) });
    } catch (error) {
        console.error("Supplier rate list failed:", error);
        return res.status(500).json({ message: "Could not load supplier rates." });
    }
};

const createRate = async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid supplier ID." });
    res.setHeader("Cache-Control", "no-store");
    try {
        const supplier = await findSupplier(req.params.id);
        if (!supplier) return res.status(404).json({ message: "Supplier not found." });
        const parsed = parseSupplierRate(req.body, supplier.category);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        if (parsed.value.status === "Active" && await SupplierRate.findOne(overlapQuery(supplier._id, parsed.value))) {
            return res.status(409).json({ message: "An active rate for this service, unit, meal plan, occupancy and currency already covers these dates. Review or deactivate it first." });
        }
        const rate = await SupplierRate.create({ ...parsed.value, supplier: supplier._id,
            createdBy: req.admin._id, updatedBy: req.admin._id });
        await log(req, "added", supplier);
        return res.status(201).json(present(rate));
    } catch (error) { return handleError(res, error); }
};

const updateRate = async (req, res) => {
    if (!validId(req.params.id) || !validId(req.params.rateId)) return res.status(400).json({ message: "Invalid supplier or rate ID." });
    if (!Number.isSafeInteger(req.body?.expectedVersion) || req.body.expectedVersion < 0) {
        return res.status(400).json({ message: "Reload the rate before changing it." });
    }
    res.setHeader("Cache-Control", "no-store");
    try {
        const supplier = await findSupplier(req.params.id);
        if (!supplier) return res.status(404).json({ message: "Supplier not found." });
        const rate = await SupplierRate.findOne({ _id: req.params.rateId, supplier: supplier._id });
        if (!rate) return res.status(404).json({ message: "Rate not found for this supplier." });
        if (rate.__v !== req.body.expectedVersion) return res.status(409).json({ message: "This rate changed. Reload and review the latest details." });
        const parsed = parseSupplierRate(req.body, supplier.category);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        if (!changed(rate, parsed.value)) return res.status(400).json({ message: "Change at least one rate detail before saving." });
        if (parsed.value.status === "Active" && await SupplierRate.findOne(overlapQuery(supplier._id, parsed.value, rate._id))) {
            return res.status(409).json({ message: "Another active rate for this service, unit, meal plan, occupancy and currency covers these dates." });
        }
        rate.history.push({ revision: rate.revision, ...Object.fromEntries(rateFields.map((field) => [field, rate[field]])),
            changedAt: new Date(), changedByName: String(req.admin.name || "Staff").slice(0, 100) });
        Object.assign(rate, parsed.value, { revision: rate.revision + 1, updatedBy: req.admin._id });
        await rate.save();
        await log(req, "updated", supplier);
        return res.json(present(rate));
    } catch (error) { return handleError(res, error); }
};

module.exports = { listRates, createRate, updateRate };
