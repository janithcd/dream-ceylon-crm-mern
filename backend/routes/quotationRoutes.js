const express = require("express");

const { generateQuotationPdf } = require("../controllers/quotationController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/pdf", protect, generateQuotationPdf);

module.exports = router;