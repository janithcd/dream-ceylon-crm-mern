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
const {
    authorizePermissions,
} = require("../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../config/permissions");

const router = express.Router();

const looksLikeRefund = (body = {}) => {
    const status = String(body.status || "")
        .trim()
        .toLowerCase();

    const paymentType = String(body.paymentType || "")
        .trim()
        .toLowerCase();

    return status === "refunded" || paymentType === "refund";
};

const authorizePaymentCreateOrRefund = (req, res, next) => {
    const permission = looksLikeRefund(req.body)
        ? PERMISSIONS.PAYMENT_REFUND
        : PERMISSIONS.PAYMENT_CREATE;

    return authorizePermissions(permission)(req, res, next);
};

const authorizePaymentUpdateOrRefund = (req, res, next) => {
    const permission = looksLikeRefund(req.body)
        ? PERMISSIONS.PAYMENT_REFUND
        : PERMISSIONS.PAYMENT_UPDATE;

    return authorizePermissions(permission)(req, res, next);
};

router.post(
    "/",
    protect,
    authorizePaymentCreateOrRefund,
    createBookingPayment
);

router.get(
    "/",
    protect,
    authorizePermissions(PERMISSIONS.PAYMENT_VIEW),
    getBookingPayments
);

router.get(
    "/booking/:bookingId",
    protect,
    authorizePermissions(PERMISSIONS.PAYMENT_VIEW),
    getBookingPaymentsByBooking
);

router.get(
    "/:id",
    protect,
    authorizePermissions(PERMISSIONS.PAYMENT_VIEW),
    getBookingPaymentById
);

router.put(
    "/:id",
    protect,
    authorizePaymentUpdateOrRefund,
    updateBookingPayment
);

router.delete(
    "/:id",
    protect,
    authorizePermissions(PERMISSIONS.PAYMENT_DELETE),
    deleteBookingPayment
);

module.exports = router;
