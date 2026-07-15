const express = require("express");

const {
    createVehicle,
    getVehicles,
    getVehicleById,
    updateVehicle,
    deleteVehicle,
} = require("../controllers/vehicleController");

const { protect } = require("../middleware/authMiddleware");
const {
    authorizePermissions,
} = require("../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../config/permissions");

const router = express.Router();

router.post(
    "/",
    protect,
    authorizePermissions(PERMISSIONS.VEHICLE_MANAGE),
    createVehicle
);

router.get(
    "/",
    protect,
    authorizePermissions(PERMISSIONS.VEHICLE_VIEW),
    getVehicles
);

router.get(
    "/:id",
    protect,
    authorizePermissions(PERMISSIONS.VEHICLE_VIEW),
    getVehicleById
);

router.put(
    "/:id",
    protect,
    authorizePermissions(PERMISSIONS.VEHICLE_MANAGE),
    updateVehicle
);

router.delete(
    "/:id",
    protect,
    authorizePermissions(PERMISSIONS.VEHICLE_MANAGE),
    deleteVehicle
);

module.exports = router;
