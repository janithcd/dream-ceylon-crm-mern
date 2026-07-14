const express = require("express");

const {
    createBookingPayment,
    getBookingPayments,
    getBookingPaymentsByBooking,
    getBookingPaymentById,
    updateBookingPayment,
    deleteBookingPayment,
} = require("../controllers/bookingPaymentController");

const { protect } = require("../middleware/authMiddleware");
console.log({
    createBookingPayment: typeof createBookingPayment,
    getBookingPayments: typeof getBookingPayments,
    getBookingPaymentsByBooking: typeof getBookingPaymentsByBooking,
    getBookingPaymentById: typeof getBookingPaymentById,
    updateBookingPayment: typeof updateBookingPayment,
    deleteBookingPayment: typeof deleteBookingPayment,
    protect: typeof protect,
});
const router = express.Router();


router.post("/", protect, createBookingPayment);


router.get("/", protect, getBookingPayments);


router.get(
    "/booking/:bookingId",
    protect,
    getBookingPaymentsByBooking
);


router.get("/:id", protect, getBookingPaymentById);


router.put("/:id", protect, updateBookingPayment);


router.delete("/:id", protect, deleteBookingPayment);

module.exports = router;