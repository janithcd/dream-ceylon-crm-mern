const express = require("express");

const {
    getDashboardStats,
} = require("../controllers/dashboardController");

const { protect } = require("../middleware/authMiddleware");
const {
    authorizePermissions,
} = require("../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../config/permissions");

const router = express.Router();

router.get(
    "/stats",
    protect,
    authorizePermissions(PERMISSIONS.DASHBOARD_VIEW),
    getDashboardStats
);

module.exports = router;
