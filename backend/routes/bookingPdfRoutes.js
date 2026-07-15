const express = require("express");

const {
    generateBookingInvoicePdf,
    generateBookingReceiptPdf,
} = require("../controllers/bookingPdfController");

const { protect } = require("../middleware/authMiddleware");
const {
    authorizePermissions,
} = require("../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../config/permissions");

const router = express.Router();

router.post(
    "/invoice/:id",
    protect,
    authorizePermissions(
        PERMISSIONS.BOOKING_VIEW,
        PERMISSIONS.PDF_GENERATE
    ),
    generateBookingInvoicePdf
);

router.post(
    "/receipt/:id",
    protect,
    authorizePermissions(
        PERMISSIONS.BOOKING_VIEW,
        PERMISSIONS.PDF_GENERATE
    ),
    generateBookingReceiptPdf
);

module.exports = router;
