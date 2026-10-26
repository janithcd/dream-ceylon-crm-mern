const express = require("express");

const {
    generateBookingInvoicePdf,
    generateBookingReceiptPdf,
} = require("../controllers/bookingPdfController");
const { generateOperationsBriefPdf } = require("../controllers/bookingBriefPdfController");
const { generateGuestItineraryPdf } = require("../controllers/guestItineraryPdfController");
const { generateHotelVoucherPdf } = require("../controllers/hotelVoucherPdfController");
const { generateGuestPaymentStatementPdf, getGuestPaymentStatementReadiness } = require("../controllers/guestPaymentStatementPdfController");

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

router.post(
    "/guest-itinerary/:id",
    protect,
    authorizePermissions(PERMISSIONS.BOOKING_VIEW, PERMISSIONS.PDF_GENERATE),
    generateGuestItineraryPdf
);

router.post(
    "/hotel-voucher/:id/:stayId",
    protect,
    authorizePermissions(PERMISSIONS.BOOKING_VIEW, PERMISSIONS.PDF_GENERATE),
    generateHotelVoucherPdf
);

router.post(
    "/payment-statement/:id",
    protect,
    authorizePermissions(PERMISSIONS.BOOKING_VIEW, PERMISSIONS.PAYMENT_VIEW, PERMISSIONS.PDF_GENERATE),
    generateGuestPaymentStatementPdf
);

router.get(
    "/payment-statement/:id/readiness",
    protect,
    authorizePermissions(PERMISSIONS.BOOKING_VIEW, PERMISSIONS.PAYMENT_VIEW),
    getGuestPaymentStatementReadiness
);

module.exports = router;
