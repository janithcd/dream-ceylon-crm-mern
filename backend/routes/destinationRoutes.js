const express = require("express");

const {
    createDestination,
    getDestinations,
    getDestinationById,
    updateDestination,
    deleteDestination,
} = require("../controllers/destinationController");

const { protect } = require("../middleware/authMiddleware");
const {
    authorizePermissions,
} = require("../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../config/permissions");

const router = express.Router();

router.post(
    "/",
    protect,
    authorizePermissions(PERMISSIONS.DESTINATION_MANAGE),
    createDestination
);

router.get(
    "/",
    protect,
    authorizePermissions(PERMISSIONS.DESTINATION_VIEW),
    getDestinations
);

router.get(
    "/:id",
    protect,
    authorizePermissions(PERMISSIONS.DESTINATION_VIEW),
    getDestinationById
);

router.put(
    "/:id",
    protect,
    authorizePermissions(PERMISSIONS.DESTINATION_MANAGE),
    updateDestination
);

router.delete(
    "/:id",
    protect,
    authorizePermissions(PERMISSIONS.DESTINATION_MANAGE),
    deleteDestination
);

module.exports = router;
