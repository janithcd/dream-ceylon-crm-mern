const express = require("express");
const { generateClientReply } = require("../controllers/aiController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/client-reply", protect, generateClientReply);

module.exports = router;