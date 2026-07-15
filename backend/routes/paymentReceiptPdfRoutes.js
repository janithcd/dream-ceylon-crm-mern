const express = require("express");

const {
    generateSinglePaymentReceiptPdf,
} = require("../controllers/paymentReceiptPdfController");

const { protect } = require("../middleware/authMiddleware");
const {
    authorizePermissions,
} = require("../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../config/permissions");

const router = express.Router();

router.post(
    "/:id",
    protect,
    authorizePermissions(
        PERMISSIONS.PAYMENT_VIEW,
        PERMISSIONS.PDF_GENERATE
    ),
    generateSinglePaymentReceiptPdf
);

module.exports = router;
