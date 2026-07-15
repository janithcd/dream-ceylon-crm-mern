const express = require("express");

const {
    createPackage,
    getPackages,
    getPackageById,
    updatePackage,
    deletePackage,
} = require("../controllers/packageController");

const { protect } = require("../middleware/authMiddleware");
const {
    authorizePermissions,
} = require("../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../config/permissions");

const router = express.Router();

router.post(
    "/",
    protect,
    authorizePermissions(PERMISSIONS.PACKAGE_MANAGE),
    createPackage
);

router.get(
    "/",
    protect,
    authorizePermissions(PERMISSIONS.PACKAGE_VIEW),
    getPackages
);

router.get(
    "/:id",
    protect,
    authorizePermissions(PERMISSIONS.PACKAGE_VIEW),
    getPackageById
);

router.put(
    "/:id",
    protect,
    authorizePermissions(PERMISSIONS.PACKAGE_MANAGE),
    updatePackage
);

router.delete(
    "/:id",
    protect,
    authorizePermissions(PERMISSIONS.PACKAGE_MANAGE),
    deletePackage
);

module.exports = router;
