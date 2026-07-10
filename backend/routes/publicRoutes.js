const express = require("express");

const {
    getPublicHomeData,
    getPublicDestinations,
    getPublicDestinationById,
    getPublicPackages,
    getPublicPackageById,
    getPublicVehicles,
} = require("../controllers/publicController");

const router = express.Router();

router.get("/home", getPublicHomeData);

router.get("/destinations", getPublicDestinations);
router.get("/destinations/:id", getPublicDestinationById);

router.get("/packages", getPublicPackages);
router.get("/packages/:id", getPublicPackageById);

router.get("/vehicles", getPublicVehicles);

module.exports = router;