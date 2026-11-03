const express = require("express");

const {
    getPublicHomeData,
    getPublicDestinations,
    getPublicDestinationById,
    getPublicPackages,
    getPublicPackageById,
    getPublicVehicles,
} = require("../controllers/publicController");

const {
    createInquiry,
} = require("../controllers/inquiryController");

const {
    publicInquiryLimiter,
} = require("../config/security");
const { validatePublicInquiry } = require("../utils/publicInquiryProtection");

const router = express.Router();

router.get("/home", getPublicHomeData);

router.get("/destinations", getPublicDestinations);
router.get("/destinations/:id", getPublicDestinationById);

router.get("/packages", getPublicPackages);
router.get("/packages/:id", getPublicPackageById);

router.get("/vehicles", getPublicVehicles);

router.post(
    "/inquiries",
    publicInquiryLimiter,
    validatePublicInquiry,
    createInquiry
);

module.exports = router;
