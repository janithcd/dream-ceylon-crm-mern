const express = require("express");

const {
    generateClientReply,
    generateItinerary,
} = require("../controllers/aiController");

const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/client-reply", protect, generateClientReply);
router.post("/itinerary", protect, generateItinerary);

module.exports = router;