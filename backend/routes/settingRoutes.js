const express = require("express");

const {
    getCompanySettings,
    updateCompanySettings,
    resetCompanySettings,
} = require("../controllers/settingController");

const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/company", protect, getCompanySettings);
router.put("/company", protect, updateCompanySettings);
router.post("/company/reset", protect, resetCompanySettings);

module.exports = router;