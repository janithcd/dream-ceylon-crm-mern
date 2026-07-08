const express = require("express");

const {
    createInquiry,
    getInquiries,
    getInquiryById,
    updateInquiry,
    deleteInquiry,
} = require("../controllers/inquiryController");

const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.route("/").post(createInquiry).get(protect, getInquiries);

router
    .route("/:id")
    .get(protect, getInquiryById)
    .put(protect, updateInquiry)
    .delete(protect, deleteInquiry);

module.exports = router;