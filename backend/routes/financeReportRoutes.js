const express = require("express");

const { getPaymentReport } = require("../controllers/financeReportController");

const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/reports/payments", protect, getPaymentReport);

module.exports = router;