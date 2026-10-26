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
const { getPreparationStarter, applyPreparationStarter } = require("../controllers/bookingPreparationStarterController");
const { getBookingActivity } = require("../controllers/bookingActivityController");
const { getItinerary, addItineraryDay, updateItineraryDay, deleteItineraryDay } = require("../controllers/bookingItineraryController");
const { previewPackageItinerary, importPackageItinerary } = require("../controllers/bookingPackageImportController");
const {
    getTransportAssignments,
    addTransportAssignment,
    updateTransportAssignment,
    deleteTransportAssignment,
} = require("../controllers/bookingTransportController");
const { getTeamTasks } = require("../controllers/teamTasksController");
const { getSupplierConfirmations } = require("../controllers/supplierConfirmationsController");
const { getHotelCancellationDeadlines } = require("../controllers/hotelCancellationDeadlinesController");
const { getCancellationReview } = require("../controllers/cancellationReviewController");
const { getSupplierContacts, logSupplierContact } = require("../controllers/supplierContactController");
const { getAirportTransfers } = require("../controllers/airportTransfersController");
const { getGuestTransferMessage } = require("../controllers/guestTransferMessageController");
const { getHotelConfirmationDraft } = require("../controllers/hotelConfirmationDraftController");
const { getHotelCancellationDraft } = require("../controllers/hotelCancellationDraftController");
const { getTravelerRoster, saveTravelerRoster } = require("../controllers/bookingTravelerController");
const { getOutstandingBalances, getPaymentAttention, updatePaymentDueDate, updateHotelAdvance, logPaymentContact } = require("../controllers/outstandingBalancesController");
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
    "/airport-transfers",
    protect,
    authorizePermissions(PERMISSIONS.BOOKING_VIEW),
    getAirportTransfers
);

router.get(
    "/supplier-confirmations",
    protect,
    authorizePermissions(PERMISSIONS.BOOKING_VIEW),
    getSupplierConfirmations
);

router.get("/hotel-cancellation-deadlines", protect, authorizePermissions(PERMISSIONS.BOOKING_VIEW), getHotelCancellationDeadlines);
router.get("/cancellation-review", protect, authorizePermissions(PERMISSIONS.BOOKING_VIEW), getCancellationReview);

router.get("/:id/supplier-contacts/:type/:itemId", protect, authorizePermissions(PERMISSIONS.BOOKING_VIEW), getSupplierContacts);
router.post("/:id/supplier-contacts/:type/:itemId", protect, authorizePermissions(PERMISSIONS.BOOKING_VIEW, PERMISSIONS.BOOKING_UPDATE), logSupplierContact);

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
    "/:id/hotel-advance",
    protect,
    authorizePermissions(PERMISSIONS.BOOKING_VIEW, PERMISSIONS.PAYMENT_UPDATE),
    updateHotelAdvance
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

router.get("/:id/preparation-starter", protect, authorizePermissions(PERMISSIONS.BOOKING_VIEW), getPreparationStarter);
router.post("/:id/preparation-starter", protect, authorizePermissions(PERMISSIONS.BOOKING_UPDATE), applyPreparationStarter);

router.get(
    "/:id/activity",
    protect,
    authorizePermissions(PERMISSIONS.BOOKING_VIEW),
    getBookingActivity
);

router.get("/:id/itinerary", protect, authorizePermissions(PERMISSIONS.BOOKING_VIEW), getItinerary);
router.get("/:id/travelers", protect, authorizePermissions(PERMISSIONS.BOOKING_VIEW), getTravelerRoster);
router.put("/:id/travelers", protect, authorizePermissions(PERMISSIONS.BOOKING_VIEW, PERMISSIONS.BOOKING_UPDATE), saveTravelerRoster);
router.post("/:id/itinerary", protect, authorizePermissions(PERMISSIONS.BOOKING_UPDATE), addItineraryDay);
router.get("/:id/itinerary/package-preview", protect, authorizePermissions(PERMISSIONS.BOOKING_VIEW, PERMISSIONS.PACKAGE_VIEW), previewPackageItinerary);
router.post("/:id/itinerary/import-package", protect, authorizePermissions(PERMISSIONS.BOOKING_UPDATE, PERMISSIONS.PACKAGE_VIEW), importPackageItinerary);
router.put("/:id/itinerary/:dayId", protect, authorizePermissions(PERMISSIONS.BOOKING_UPDATE), updateItineraryDay);
router.delete("/:id/itinerary/:dayId", protect, authorizePermissions(PERMISSIONS.BOOKING_UPDATE), deleteItineraryDay);

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

router.get(
    "/:id/transport-assignments/:assignmentId/guest-message",
    protect,
    authorizePermissions(PERMISSIONS.BOOKING_VIEW, PERMISSIONS.BOOKING_UPDATE),
    getGuestTransferMessage
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

router.get(
    "/:id/hotel-stays/:stayId/confirmation-draft",
    protect,
    authorizePermissions(PERMISSIONS.BOOKING_VIEW, PERMISSIONS.BOOKING_UPDATE),
    getHotelConfirmationDraft
);

router.get(
    "/:id/hotel-stays/:stayId/cancellation-draft",
    protect,
    authorizePermissions(PERMISSIONS.BOOKING_VIEW, PERMISSIONS.BOOKING_UPDATE),
    getHotelCancellationDraft
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
