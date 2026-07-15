const express = require("express");

const {
    generateItineraryPdf,
} = require("../controllers/pdfController");

const { protect } = require("../middleware/authMiddleware");
const {
    authorizePermissions,
} = require("../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../config/permissions");

const router = express.Router();

router.post(
    "/itinerary",
    protect,
    authorizePermissions(PERMISSIONS.PDF_GENERATE),
    generateItineraryPdf
);

module.exports = router;
