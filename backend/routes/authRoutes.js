const express = require("express");

const {
    loginAdmin,
    getAdminProfile,
} = require("../controllers/authController");

const {
    protect,
} = require("../middleware/authMiddleware");

const router = express.Router();

// Public login
router.post("/login", loginAdmin);



// Protected profile
router.get("/profile", protect, getAdminProfile);

module.exports = router;