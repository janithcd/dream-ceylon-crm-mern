const express = require("express");

const {
    createVehicle,
    getVehicles,
    getVehicleById,
    updateVehicle,
    deleteVehicle,
} = require("../controllers/vehicleController");

const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.route("/").post(protect, createVehicle).get(protect, getVehicles);

router
    .route("/:id")
    .get(protect, getVehicleById)
    .put(protect, updateVehicle)
    .delete(protect, deleteVehicle);

module.exports = router;