const express = require("express");

const {
    searchCustomers,
    getCustomerProfile,
} = require("../controllers/customerController");

const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/search", protect, searchCustomers);
router.get("/profile", protect, getCustomerProfile);

module.exports = router;