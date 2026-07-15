const express = require("express");

const {
    generateQuotationPdf,
} = require("../controllers/quotationController");

const {
    createQuotation,
    getQuotations,
    getQuotationById,
    updateQuotation,
    deleteQuotation,
} = require("../controllers/quotationCrudController");

const {
    convertQuotationToBooking,
} = require("../controllers/quotationConversionController");

const { protect } = require("../middleware/authMiddleware");
const {
    authorizePermissions,
} = require("../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../config/permissions");

const router = express.Router();

router.post(
    "/pdf",
    protect,
    authorizePermissions(
        PERMISSIONS.QUOTATION_VIEW,
        PERMISSIONS.PDF_GENERATE
    ),
    generateQuotationPdf
);

router.post(
    "/",
    protect,
    authorizePermissions(PERMISSIONS.QUOTATION_CREATE),
    createQuotation
);

router.get(
    "/",
    protect,
    authorizePermissions(PERMISSIONS.QUOTATION_VIEW),
    getQuotations
);

router.post(
    "/:id/convert-to-booking",
    protect,
    authorizePermissions(PERMISSIONS.QUOTATION_CONVERT),
    convertQuotationToBooking
);

router.get(
    "/:id",
    protect,
    authorizePermissions(PERMISSIONS.QUOTATION_VIEW),
    getQuotationById
);

router.put(
    "/:id",
    protect,
    authorizePermissions(PERMISSIONS.QUOTATION_UPDATE),
    updateQuotation
);

router.delete(
    "/:id",
    protect,
    authorizePermissions(PERMISSIONS.QUOTATION_DELETE),
    deleteQuotation
);

module.exports = router;
