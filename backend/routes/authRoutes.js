const express = require("express");

const {
    loginAdmin,
    getAdminProfile,
} = require("../controllers/authController");

const { protect } = require("../middleware/authMiddleware");
const { authLimiter } = require("../config/security");

const router = express.Router();

router.post("/login", authLimiter, loginAdmin);
router.get("/profile", protect, getAdminProfile);

module.exports = router;

