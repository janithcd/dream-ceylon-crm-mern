const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { authorizePermissions } = require("../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../config/permissions");
const { listSuppliers, createSupplier, updateSupplier } = require("../controllers/supplierController");

const router = express.Router();
router.use(protect);
router.get("/", authorizePermissions(PERMISSIONS.SUPPLIER_VIEW), listSuppliers);
router.post("/", authorizePermissions(PERMISSIONS.SUPPLIER_MANAGE), createSupplier);
router.put("/:id", authorizePermissions(PERMISSIONS.SUPPLIER_MANAGE), updateSupplier);

module.exports = router;
