const express = require("express");

const {
    createInquiry,
    createManualInquiry,
    getInquiries,
    getInquiryById,
    updateInquiry,
    deleteInquiry,
} = require(
    "../controllers/inquiryController"
);
const { getLeadInsights } = require("../controllers/leadInsightsController");

const {
    protect,
} = require("../middleware/authMiddleware");
const { authorizePermissions } = require("../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../config/permissions");
const { publicInquiryLimiter } = require("../config/security");

const router = express.Router();

/*
 * PUBLIC ROUTE
 *
 * Website visitors must be able to submit
 * an inquiry without an admin login token.
 */
router.post(
    "/",
    publicInquiryLimiter,
    createInquiry
);

/*
 * Everything below this line is private
 * and requires an authenticated CRM admin.
 */
router.use(protect);

router.post("/manual", authorizePermissions(PERMISSIONS.INQUIRY_CREATE), createManualInquiry);
router.get("/insights", authorizePermissions(PERMISSIONS.INQUIRY_VIEW), getLeadInsights);

router.get(
    "/",
    authorizePermissions(PERMISSIONS.INQUIRY_VIEW),
    getInquiries
);

router.get(
    "/:id",
    authorizePermissions(PERMISSIONS.INQUIRY_VIEW),
    getInquiryById
);

router.put(
    "/:id",
    authorizePermissions(PERMISSIONS.INQUIRY_UPDATE),
    updateInquiry
);

router.delete(
    "/:id",
    authorizePermissions(PERMISSIONS.INQUIRY_DELETE),
    deleteInquiry
);

module.exports = router;
