const express = require("express");

const {
    createFollowUp,
    getFollowUps,
    getFollowUpSummary,
    getFollowUpById,
    updateFollowUp,
    completeFollowUp,
    deleteFollowUp,
} = require("../controllers/followUpController");

const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", protect, createFollowUp);
router.get("/", protect, getFollowUps);

router.get("/summary", protect, getFollowUpSummary);

router.get("/:id", protect, getFollowUpById);
router.put("/:id", protect, updateFollowUp);
router.patch("/:id/complete", protect, completeFollowUp);
router.delete("/:id", protect, deleteFollowUp);

module.exports = router;