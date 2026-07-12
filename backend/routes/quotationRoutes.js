const express = require("express");

const { generateQuotationPdf } = require("../controllers/quotationController");

const {
    createQuotation,
    getQuotations,
    getQuotationById,
    updateQuotation,
    deleteQuotation,
} = require("../controllers/quotationCrudController");

const {
    convertQuotationToBooking,
} = require("../controllers/quotationConversionController");

const { protect } = require("../middleware/authMiddleware");


const router = express.Router();

router.post("/pdf", protect, generateQuotationPdf);

router.post("/", protect, createQuotation);
router.get("/", protect, getQuotations);

router.get("/:id", protect, getQuotationById);
router.put("/:id", protect, updateQuotation);
router.delete("/:id", protect, deleteQuotation);

router.post("/:id/convert-to-booking", protect, convertQuotationToBooking);

module.exports = router;