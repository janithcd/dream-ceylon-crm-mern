const express = require("express");

const {
    searchCustomers,
    getCustomerProfile,
} = require("../controllers/customerController");

const { protect } = require("../middleware/authMiddleware");
const {
    authorizePermissions,
} = require("../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../config/permissions");

const router = express.Router();

router.get(
    "/search",
    protect,
    authorizePermissions(PERMISSIONS.CUSTOMER_VIEW),
    searchCustomers
);

router.get(
    "/profile",
    protect,
    authorizePermissions(PERMISSIONS.CUSTOMER_VIEW),
    getCustomerProfile
);

module.exports = router;
