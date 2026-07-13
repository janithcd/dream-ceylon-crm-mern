const express = require("express");

const {
    generateSinglePaymentReceiptPdf,
} = require("../controllers/paymentReceiptPdfController");

const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/:id", protect, generateSinglePaymentReceiptPdf);

module.exports = router;