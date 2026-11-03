const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { authorizePermissions } = require("../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../config/permissions");
const { listSuppliers, createSupplier, updateSupplier } = require("../controllers/supplierController");
const { listRates, createRate, updateRate } = require("../controllers/supplierRateController");

const router = express.Router();
router.use(protect);
router.get("/", authorizePermissions(PERMISSIONS.SUPPLIER_VIEW), listSuppliers);
router.post("/", authorizePermissions(PERMISSIONS.SUPPLIER_MANAGE), createSupplier);
router.put("/:id", authorizePermissions(PERMISSIONS.SUPPLIER_MANAGE), updateSupplier);
router.get("/:id/rates", authorizePermissions(PERMISSIONS.SUPPLIER_VIEW), listRates);
router.post("/:id/rates", authorizePermissions(PERMISSIONS.SUPPLIER_MANAGE), createRate);
router.put("/:id/rates/:rateId", authorizePermissions(PERMISSIONS.SUPPLIER_MANAGE), updateRate);

module.exports = router;
