const express = require("express");

const {
    createInquiry,
    getInquiries,
    getInquiryById,
    updateInquiry,
    deleteInquiry,
} = require("../controllers/inquiryController");

const { protect } = require("../middleware/authMiddleware");
const {
    authorizePermissions,
} = require("../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../config/permissions");

const router = express.Router();

router.post(
    "/",
    protect,
    authorizePermissions(PERMISSIONS.INQUIRY_CREATE),
    createInquiry
);

router.get(
    "/",
    protect,
    authorizePermissions(PERMISSIONS.INQUIRY_VIEW),
    getInquiries
);

router.get(
    "/:id",
    protect,
    authorizePermissions(PERMISSIONS.INQUIRY_VIEW),
    getInquiryById
);

router.put(
    "/:id",
    protect,
    authorizePermissions(PERMISSIONS.INQUIRY_UPDATE),
    updateInquiry
);

router.delete(
    "/:id",
    protect,
    authorizePermissions(PERMISSIONS.INQUIRY_DELETE),
    deleteInquiry
);

module.exports = router;
