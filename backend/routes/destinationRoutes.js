const express = require("express");

const {
    createDestination,
    getDestinations,
    getDestinationById,
    updateDestination,
    deleteDestination,
} = require("../controllers/destinationController");

const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router
    .route("/")
    .post(protect, createDestination)
    .get(protect, getDestinations);

router
    .route("/:id")
    .get(protect, getDestinationById)
    .put(protect, updateDestination)
    .delete(protect, deleteDestination);

module.exports = router;