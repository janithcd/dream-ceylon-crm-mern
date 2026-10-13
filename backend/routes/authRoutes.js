const express = require("express");

const {
    loginAdmin,
    getAdminProfile,
} = require("../controllers/authController");

const { protect } = require("../middleware/authMiddleware");
const { authLimiter, recoveryLimiter } = require("../config/security");
const { requestPasswordReset, verifyResetCode, resetPassword } = require("../controllers/passwordResetController");

const router = express.Router();

router.post("/login", authLimiter, loginAdmin);
router.post("/forgot-password", recoveryLimiter, requestPasswordReset);
router.post("/verify-reset-code", recoveryLimiter, verifyResetCode);
router.post("/reset-password", recoveryLimiter, resetPassword);
router.get("/profile", protect, getAdminProfile);

module.exports = router;

