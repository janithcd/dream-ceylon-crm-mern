const express = require("express");

const {
    createBookingPayment,
    getBookingPayments,
    getPaymentsByBooking,
    getBookingPaymentById,
    updateBookingPayment,
    deleteBookingPayment,
} = require("../controllers/bookingPaymentController");

const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", protect, createBookingPayment);
router.get("/", protect, getBookingPayments);

router.get("/booking/:bookingId", protect, getPaymentsByBooking);

router.get("/:id", protect, getBookingPaymentById);
router.put("/:id", protect, updateBookingPayment);
router.delete("/:id", protect, deleteBookingPayment);

module.exports = router;