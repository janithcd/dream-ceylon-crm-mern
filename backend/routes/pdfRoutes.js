const express = require("express");
const { generateItineraryPdf } = require("../controllers/pdfController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/itinerary", protect, generateItineraryPdf);

module.exports = router;