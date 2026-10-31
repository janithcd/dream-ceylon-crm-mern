const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { authorizePermissions } = require("../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../config/permissions");
const { getCostOverview, getSupplierPayables, getSupplierSchedule, getSupplierPaymentRegister, exportSupplierPaymentRegister,
    addCost, updateCost, recordSupplierPayment, reconcileSupplierPayment, deleteCost } = require("../controllers/costController");
const { getSupplierRemittance, saveSupplierRemittance, downloadSupplierRemittance } = require("../controllers/supplierRemittanceController");

const router = express.Router();
router.use(protect);
router.get("/payables", authorizePermissions(PERMISSIONS.COST_VIEW), getSupplierPayables);
router.get("/schedule", authorizePermissions(PERMISSIONS.COST_VIEW), getSupplierSchedule);
router.get("/payment-register", authorizePermissions(PERMISSIONS.COST_VIEW), getSupplierPaymentRegister);
router.get("/payment-register/export", authorizePermissions(PERMISSIONS.COST_VIEW, PERMISSIONS.REPORT_EXPORT), exportSupplierPaymentRegister);
router.get("/:type/:id", authorizePermissions(PERMISSIONS.COST_VIEW), getCostOverview);
router.post("/:id/payments", authorizePermissions(PERMISSIONS.COST_VIEW, PERMISSIONS.COST_MANAGE), recordSupplierPayment);
router.patch("/:id/payments/:paymentId/reconciliation", authorizePermissions(PERMISSIONS.COST_VIEW, PERMISSIONS.COST_MANAGE), reconcileSupplierPayment);
router.get("/:id/payments/:paymentId/remittance", authorizePermissions(PERMISSIONS.COST_VIEW), getSupplierRemittance);
router.put("/:id/payments/:paymentId/remittance", authorizePermissions(PERMISSIONS.COST_VIEW, PERMISSIONS.COST_MANAGE), saveSupplierRemittance);
router.post("/:id/payments/:paymentId/remittance/pdf", authorizePermissions(PERMISSIONS.COST_VIEW, PERMISSIONS.PDF_GENERATE), downloadSupplierRemittance);
router.post("/:type/:id", authorizePermissions(PERMISSIONS.COST_VIEW, PERMISSIONS.COST_MANAGE), addCost);
router.put("/:id", authorizePermissions(PERMISSIONS.COST_VIEW, PERMISSIONS.COST_MANAGE), updateCost);
router.delete("/:id", authorizePermissions(PERMISSIONS.COST_VIEW, PERMISSIONS.COST_MANAGE), deleteCost);

module.exports = router;
