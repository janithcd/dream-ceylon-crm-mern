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
const {
    authorizePermissions,
} = require("../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../config/permissions");

const router = express.Router();

router.post(
    "/",
    protect,
    authorizePermissions(PERMISSIONS.FOLLOW_UP_MANAGE),
    createFollowUp
);

router.get(
    "/",
    protect,
    authorizePermissions(PERMISSIONS.FOLLOW_UP_VIEW),
    getFollowUps
);

router.get(
    "/summary",
    protect,
    authorizePermissions(PERMISSIONS.FOLLOW_UP_VIEW),
    getFollowUpSummary
);

router.get(
    "/:id",
    protect,
    authorizePermissions(PERMISSIONS.FOLLOW_UP_VIEW),
    getFollowUpById
);

router.put(
    "/:id",
    protect,
    authorizePermissions(PERMISSIONS.FOLLOW_UP_MANAGE),
    updateFollowUp
);

router.patch(
    "/:id/complete",
    protect,
    authorizePermissions(PERMISSIONS.FOLLOW_UP_MANAGE),
    completeFollowUp
);

router.delete(
    "/:id",
    protect,
    authorizePermissions(PERMISSIONS.FOLLOW_UP_MANAGE),
    deleteFollowUp
);

module.exports = router;
