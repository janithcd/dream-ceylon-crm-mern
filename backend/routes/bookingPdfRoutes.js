const express = require("express");

const {
    generateBookingInvoicePdf,
    generateBookingReceiptPdf,
} = require("../controllers/bookingPdfController");

const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/invoice/:id", protect, generateBookingInvoicePdf);
router.post("/receipt/:id", protect, generateBookingReceiptPdf);

module.exports = router;