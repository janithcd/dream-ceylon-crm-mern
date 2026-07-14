const express = require("express");

const {
    getActivityLogs,
    getActivityLogById,
    getActivityLogSummary,
} = require("../controllers/activityLogController");

const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", protect, getActivityLogs);
router.get("/summary", protect, getActivityLogSummary);
router.get("/:id", protect, getActivityLogById);

module.exports = router;