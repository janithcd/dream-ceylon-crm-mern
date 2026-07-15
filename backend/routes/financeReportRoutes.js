const express = require("express");

const {
    getPaymentReport,
} = require("../controllers/financeReportController");

const { protect } = require("../middleware/authMiddleware");

const {
    authorizePermissions,
} = require("../middleware/permissionMiddleware");

const {
    PERMISSIONS,
} = require("../config/permissions");

const router = express.Router();

router.get(
    "/reports/payments",
    protect,
    authorizePermissions(PERMISSIONS.REPORT_VIEW),
    getPaymentReport
);

module.exports = router;