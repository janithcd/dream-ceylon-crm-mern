const express = require("express");

const {
    getAdmins,
    createAdmin,
    getAdminById,
    updateAdmin,
    updateAdminStatus,
    resetAdminPassword,
    deleteAdmin,
} = require("../controllers/adminManagementController");

const { protect } = require("../middleware/authMiddleware");
const {
    authorizePermissions,
} = require("../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../config/permissions");

const router = express.Router();

router.get(
    "/",
    protect,
    authorizePermissions(PERMISSIONS.ADMIN_VIEW),
    getAdmins
);

router.post(
    "/",
    protect,
    authorizePermissions(PERMISSIONS.ADMIN_CREATE),
    createAdmin
);

router.get(
    "/:id",
    protect,
    authorizePermissions(PERMISSIONS.ADMIN_VIEW),
    getAdminById
);

router.put(
    "/:id",
    protect,
    authorizePermissions(PERMISSIONS.ADMIN_UPDATE),
    updateAdmin
);

router.patch(
    "/:id/status",
    protect,
    authorizePermissions(PERMISSIONS.ADMIN_UPDATE),
    updateAdminStatus
);

router.patch(
    "/:id/password",
    protect,
    authorizePermissions(PERMISSIONS.ADMIN_UPDATE),
    resetAdminPassword
);

router.delete(
    "/:id",
    protect,
    authorizePermissions(PERMISSIONS.ADMIN_DELETE),
    deleteAdmin
);

module.exports = router;
