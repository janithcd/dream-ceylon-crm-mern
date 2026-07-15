const express = require("express");

const {
    generateClientReply,
    generateItinerary,
} = require("../controllers/aiController");

const { protect } = require("../middleware/authMiddleware");
const {
    authorizeAnyPermission,
} = require("../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../config/permissions");

const router = express.Router();

router.post(
    "/client-reply",
    protect,
    authorizeAnyPermission(
        PERMISSIONS.INQUIRY_UPDATE,
        PERMISSIONS.QUOTATION_CREATE
    ),
    generateClientReply
);

router.post(
    "/itinerary",
    protect,
    authorizeAnyPermission(
        PERMISSIONS.QUOTATION_CREATE,
        PERMISSIONS.PDF_GENERATE
    ),
    generateItinerary
);

module.exports = router;
