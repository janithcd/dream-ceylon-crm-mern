const express = require("express");

const {
    createBooking,
    getBookings,
    getBookingById,
    updateBooking,
    deleteBooking,
} = require("../controllers/bookingController");
const {
    getPreparationAssignees,
    addPreparationTask,
    updatePreparationTaskDetails,
    claimPreparationTask,
    setPreparationTaskCompletion,
    deletePreparationTask,
} = require("../controllers/bookingPreparationController");
const { getMyTasks } = require("../controllers/myTasksController");
const { getBookingActivity } = require("../controllers/bookingActivityController");
const {
    getTransportAssignments,
    addTransportAssignment,
    updateTransportAssignment,
    deleteTransportAssignment,
} = require("../controllers/bookingTransportController");
const { getTeamTasks } = require("../controllers/teamTasksController");
const { getSupplierConfirmations } = require("../controllers/supplierConfirmationsController");
const { getOutstandingBalances, getPaymentAttention, updatePaymentDueDate, logPaymentContact } = require("../controllers/outstandingBalancesController");
const {
    addHotelStay,
    updateHotelStay,
    deleteHotelStay,
} = require("../controllers/bookingAccommodationController");

const { protect } = require("../middleware/authMiddleware");
const {
    authorizePermissions,
} = require("../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../config/permissions");

const router = express.Router();

router.get(
    "/my-tasks",
    protect,
    authorizePermissions(PERMISSIONS.BOOKING_VIEW),
    getMyTasks
);

router.get(
    "/team-tasks",
    protect,
    authorizePermissions(PERMISSIONS.BOOKING_VIEW),
    getTeamTasks
);

router.get(
    "/supplier-confirmations",
    protect,
    authorizePermissions(PERMISSIONS.BOOKING_VIEW),
    getSupplierConfirmations
);

router.get(
    "/outstanding-balances",
    protect,
    authorizePermissions(PERMISSIONS.BOOKING_VIEW, PERMISSIONS.PAYMENT_VIEW),
    getOutstandingBalances
);

router.get(
    "/payment-attention",
    protect,
    authorizePermissions(PERMISSIONS.BOOKING_VIEW, PERMISSIONS.PAYMENT_VIEW),
    getPaymentAttention
);

router.patch(
    "/:id/payment-due-date",
    protect,
    authorizePermissions(PERMISSIONS.BOOKING_VIEW, PERMISSIONS.PAYMENT_UPDATE),
    updatePaymentDueDate
);

router.patch(
    "/:id/payment-contact",
    protect,
    authorizePermissions(PERMISSIONS.BOOKING_VIEW, PERMISSIONS.PAYMENT_UPDATE),
    logPaymentContact
);

router.get(
    "/preparation-assignees",
    protect,
    authorizePermissions(PERMISSIONS.BOOKING_UPDATE),
    getPreparationAssignees
);

router.get(
    "/:id/activity",
    protect,
    authorizePermissions(PERMISSIONS.BOOKING_VIEW),
    getBookingActivity
);

router.get(
    "/:id/transport-assignments",
    protect,
    authorizePermissions(PERMISSIONS.BOOKING_VIEW),
    getTransportAssignments
);

router.post(
    "/:id/transport-assignments",
    protect,
    authorizePermissions(PERMISSIONS.BOOKING_UPDATE),
    addTransportAssignment
);

router.put(
    "/:id/transport-assignments/:assignmentId",
    protect,
    authorizePermissions(PERMISSIONS.BOOKING_UPDATE),
    updateTransportAssignment
);

router.delete(
    "/:id/transport-assignments/:assignmentId",
    protect,
    authorizePermissions(PERMISSIONS.BOOKING_UPDATE),
    deleteTransportAssignment
);

router.post(
    "/:id/hotel-stays",
    protect,
    authorizePermissions(PERMISSIONS.BOOKING_UPDATE),
    addHotelStay
);

router.put(
    "/:id/hotel-stays/:stayId",
    protect,
    authorizePermissions(PERMISSIONS.BOOKING_UPDATE),
    updateHotelStay
);

router.delete(
    "/:id/hotel-stays/:stayId",
    protect,
    authorizePermissions(PERMISSIONS.BOOKING_UPDATE),
    deleteHotelStay
);

router.post(
    "/:id/preparation-tasks",
    protect,
    authorizePermissions(PERMISSIONS.BOOKING_UPDATE),
    addPreparationTask
);

router.patch(
    "/:id/preparation-tasks/:taskId",
    protect,
    authorizePermissions(PERMISSIONS.BOOKING_UPDATE),
    setPreparationTaskCompletion
);

router.patch(
    "/:id/preparation-tasks/:taskId/claim",
    protect,
    authorizePermissions(PERMISSIONS.BOOKING_UPDATE),
    claimPreparationTask
);

router.put(
    "/:id/preparation-tasks/:taskId",
    protect,
    authorizePermissions(PERMISSIONS.BOOKING_UPDATE),
    updatePreparationTaskDetails
);

router.delete(
    "/:id/preparation-tasks/:taskId",
    protect,
    authorizePermissions(PERMISSIONS.BOOKING_UPDATE),
    deletePreparationTask
);

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
