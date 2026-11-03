const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { authorizePermissions } = require("../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../config/permissions");
const { getCostOverview, getSupplierPayables, getSupplierSchedule, getSupplierPaymentRegister, exportSupplierPaymentRegister,
    addCost, updateCost, recordSupplierPayment, documentExistingSupplierPayment, reconcileSupplierPayment, deleteCost } = require("../controllers/costController");
const { getSupplierRemittance, saveSupplierRemittance, downloadSupplierRemittance } = require("../controllers/supplierRemittanceController");
const { listPaymentAttachments, uploadPaymentAttachment, downloadPaymentAttachment, withdrawPaymentAttachment,
    getPaymentAcknowledgement, updatePaymentAcknowledgement } = require("../controllers/supplierPaymentEvidenceController");
const { MAX_FILE_BYTES, MIME_TYPES } = require("../utils/supplierPaymentEvidence");

const router = express.Router();
router.use(protect);
const privateResponse = (req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); };
const readFile = express.raw({ type: MIME_TYPES, limit: MAX_FILE_BYTES, inflate: false });
const readPaymentFile = (req, res, next) => readFile(req, res, (error) => {
    if (error) return res.status(error.status || 400).json({ message: error.status === 413
        ? "Choose a file of at most 5 MB." : "Could not read this file. Upload an uncompressed PDF, PNG or JPEG." });
    next();
});
router.get("/payables", authorizePermissions(PERMISSIONS.COST_VIEW), getSupplierPayables);
router.get("/schedule", authorizePermissions(PERMISSIONS.COST_VIEW), getSupplierSchedule);
router.get("/payment-register", authorizePermissions(PERMISSIONS.COST_VIEW), getSupplierPaymentRegister);
router.get("/payment-register/export", authorizePermissions(PERMISSIONS.COST_VIEW, PERMISSIONS.REPORT_EXPORT), exportSupplierPaymentRegister);
router.get("/:type/:id", authorizePermissions(PERMISSIONS.COST_VIEW), getCostOverview);
router.post("/:id/payments", authorizePermissions(PERMISSIONS.COST_VIEW, PERMISSIONS.COST_MANAGE), recordSupplierPayment);
router.post("/:id/payments/from-paid-total", authorizePermissions(PERMISSIONS.COST_VIEW, PERMISSIONS.COST_MANAGE), documentExistingSupplierPayment);
router.patch("/:id/payments/:paymentId/reconciliation", authorizePermissions(PERMISSIONS.COST_VIEW, PERMISSIONS.COST_MANAGE), reconcileSupplierPayment);
router.get("/:id/payments/:paymentId/remittance", authorizePermissions(PERMISSIONS.COST_VIEW), getSupplierRemittance);
router.put("/:id/payments/:paymentId/remittance", authorizePermissions(PERMISSIONS.COST_VIEW, PERMISSIONS.COST_MANAGE), saveSupplierRemittance);
router.post("/:id/payments/:paymentId/remittance/pdf", authorizePermissions(PERMISSIONS.COST_VIEW, PERMISSIONS.PDF_GENERATE), downloadSupplierRemittance);
router.get("/:id/payments/:paymentId/attachments", authorizePermissions(PERMISSIONS.COST_VIEW), privateResponse, listPaymentAttachments);
router.post("/:id/payments/:paymentId/attachments", authorizePermissions(PERMISSIONS.COST_VIEW, PERMISSIONS.COST_MANAGE), privateResponse, readPaymentFile, uploadPaymentAttachment);
router.get("/:id/payments/:paymentId/attachments/:attachmentId", authorizePermissions(PERMISSIONS.COST_VIEW), privateResponse, downloadPaymentAttachment);
router.patch("/:id/payments/:paymentId/attachments/:attachmentId/withdraw", authorizePermissions(PERMISSIONS.COST_VIEW, PERMISSIONS.COST_MANAGE), privateResponse, withdrawPaymentAttachment);
router.get("/:id/payments/:paymentId/acknowledgement", authorizePermissions(PERMISSIONS.COST_VIEW), privateResponse, getPaymentAcknowledgement);
router.patch("/:id/payments/:paymentId/acknowledgement", authorizePermissions(PERMISSIONS.COST_VIEW, PERMISSIONS.COST_MANAGE), privateResponse, updatePaymentAcknowledgement);
router.post("/:type/:id", authorizePermissions(PERMISSIONS.COST_VIEW, PERMISSIONS.COST_MANAGE), addCost);
router.put("/:id", authorizePermissions(PERMISSIONS.COST_VIEW, PERMISSIONS.COST_MANAGE), updateCost);
router.delete("/:id", authorizePermissions(PERMISSIONS.COST_VIEW, PERMISSIONS.COST_MANAGE), deleteCost);

module.exports = router;
