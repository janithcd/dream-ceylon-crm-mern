const express = require("express");

const {
    getActivityLogs,
    getActivityLogById,
    getActivityLogSummary,
} = require("../controllers/activityLogController");

const { protect } = require("../middleware/authMiddleware");
const {
    authorizePermissions,
} = require("../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../config/permissions");

const router = express.Router();

router.get(
    "/",
    protect,
    authorizePermissions(PERMISSIONS.ACTIVITY_LOG_VIEW),
    getActivityLogs
);

router.get(
    "/summary",
    protect,
    authorizePermissions(PERMISSIONS.ACTIVITY_LOG_VIEW),
    getActivityLogSummary
);

router.get(
    "/:id",
    protect,
    authorizePermissions(PERMISSIONS.ACTIVITY_LOG_VIEW),
    getActivityLogById
);

module.exports = router;
