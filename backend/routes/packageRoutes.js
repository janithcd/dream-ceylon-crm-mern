const express = require("express");

const {
    createPackage,
    getPackages,
    getPackageById,
    updatePackage,
    deletePackage,
} = require("../controllers/packageController");

const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.route("/").post(protect, createPackage).get(protect, getPackages);

router
    .route("/:id")
    .get(protect, getPackageById)
    .put(protect, updatePackage)
    .delete(protect, deletePackage);

module.exports = router;