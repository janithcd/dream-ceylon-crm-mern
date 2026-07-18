const express = require("express");

const {
    createInquiry,
    getInquiries,
    getInquiryById,
    updateInquiry,
    deleteInquiry,
} = require(
    "../controllers/inquiryController"
);

const {
    protect,
} = require("../middleware/authMiddleware");

const router = express.Router();

/*
 * PUBLIC ROUTE
 *
 * Website visitors must be able to submit
 * an inquiry without an admin login token.
 */
router.post(
    "/",
    createInquiry
);

/*
 * Everything below this line is private
 * and requires an authenticated CRM admin.
 */
router.use(protect);

router.get(
    "/",
    getInquiries
);

router.get(
    "/:id",
    getInquiryById
);

router.put(
    "/:id",
    updateInquiry
);

router.delete(
    "/:id",
    deleteInquiry
);

module.exports = router;