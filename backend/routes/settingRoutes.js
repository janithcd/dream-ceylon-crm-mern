const express = require("express");

const {
    getCompanySettings,
    updateCompanySettings,
    resetCompanySettings,
} = require("../controllers/settingController");

const { protect } = require("../middleware/authMiddleware");
const {
    authorizePermissions,
} = require("../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../config/permissions");

const router = express.Router();

router.get(
    "/company",
    protect,
    authorizePermissions(PERMISSIONS.SETTINGS_VIEW),
    getCompanySettings
);

router.put(
    "/company",
    protect,
    authorizePermissions(PERMISSIONS.SETTINGS_UPDATE),
    updateCompanySettings
);

router.post(
    "/company/reset",
    protect,
    authorizePermissions(PERMISSIONS.SETTINGS_UPDATE),
    resetCompanySettings
);

module.exports = router;
