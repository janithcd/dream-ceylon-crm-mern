const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { authorizePermissions } = require("../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../config/permissions");
const { getCostOverview, addCost, updateCost, deleteCost } = require("../controllers/costController");

const router = express.Router();
router.use(protect);
router.get("/:type/:id", authorizePermissions(PERMISSIONS.COST_VIEW), getCostOverview);
router.post("/:type/:id", authorizePermissions(PERMISSIONS.COST_VIEW, PERMISSIONS.COST_MANAGE), addCost);
router.put("/:id", authorizePermissions(PERMISSIONS.COST_VIEW, PERMISSIONS.COST_MANAGE), updateCost);
router.delete("/:id", authorizePermissions(PERMISSIONS.COST_VIEW, PERMISSIONS.COST_MANAGE), deleteCost);

module.exports = router;
