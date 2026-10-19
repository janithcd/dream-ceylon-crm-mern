const express = require("express");

const {
    generateBookingInvoicePdf,
    generateBookingReceiptPdf,
} = require("../controllers/bookingPdfController");
const { generateOperationsBriefPdf } = require("../controllers/bookingBriefPdfController");

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

router.post(
    "/operations-brief/:id",
    protect,
    authorizePermissions(
        PERMISSIONS.BOOKING_VIEW,
        PERMISSIONS.PDF_GENERATE
    ),
    generateOperationsBriefPdf
);

module.exports = router;
