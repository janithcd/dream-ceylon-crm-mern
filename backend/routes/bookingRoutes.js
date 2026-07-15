const express = require("express");

const {
    createBooking,
    getBookings,
    getBookingById,
    updateBooking,
    deleteBooking,
} = require("../controllers/bookingController");

const { protect } = require("../middleware/authMiddleware");
const {
    authorizePermissions,
} = require("../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../config/permissions");

const router = express.Router();

router.post(
    "/",
    protect,
    authorizePermissions(PERMISSIONS.BOOKING_CREATE),
    createBooking
);

router.get(
    "/",
    protect,
    authorizePermissions(PERMISSIONS.BOOKING_VIEW),
    getBookings
);

router.get(
    "/:id",
    protect,
    authorizePermissions(PERMISSIONS.BOOKING_VIEW),
    getBookingById
);

router.put(
    "/:id",
    protect,
    authorizePermissions(PERMISSIONS.BOOKING_UPDATE),
    updateBooking
);

router.delete(
    "/:id",
    protect,
    authorizePermissions(PERMISSIONS.BOOKING_DELETE),
    deleteBooking
);

module.exports = router;
