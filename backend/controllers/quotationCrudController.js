const Quotation = require("../models/Quotation");

const toNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
};

const safeText = (value) => {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
};

const parseList = (value, fallback = []) => {
    if (Array.isArray(value)) {
        return value.map((item) => safeText(item)).filter(Boolean);
    }

    if (typeof value === "string") {
        return value
            .split(/\r?\n|,/)
            .map((item) => safeText(item))
            .filter(Boolean);
    }

    return fallback;
};

const generateQuotationNo = () => {
    const year = new Date().getFullYear();
    const randomNumber = Math.floor(100000 + Math.random() * 900000);

    return `DCJ-Q-${year}-${randomNumber}`;
};

const calculateQuotationTotals = (body) => {
    const durationDays = Math.max(toNumber(body.durationDays), 0);
    const vehicleDays = Math.max(toNumber(body.vehicleDays || durationDays), 0);
    const vehicleDailyRate = Math.max(toNumber(body.vehicleDailyRate), 0);

    const hotelTotal = Math.max(toNumber(body.hotelCost), 0);
    const activitiesTotal = Math.max(toNumber(body.activitiesCost), 0);
    const entranceFeesTotal = Math.max(toNumber(body.entranceFeesCost), 0);
    const otherTotal = Math.max(toNumber(body.otherCost), 0);

    const vehicleTotal = vehicleDays * vehicleDailyRate;

    const subtotal =
        vehicleTotal +
        hotelTotal +
        activitiesTotal +
        entranceFeesTotal +
        otherTotal;

    const discount = Math.min(Math.max(toNumber(body.discount), 0), subtotal);

    const grandTotal = Math.max(subtotal - discount, 0);

    const advancePayment = Math.min(
        Math.max(toNumber(body.advancePayment), 0),
        grandTotal
    );

    const balancePayment = Math.max(grandTotal - advancePayment, 0);

    return {
        durationDays,
        vehicleDays,
        vehicleDailyRate,
        vehicleTotal,
        hotelTotal,
        activitiesTotal,
        entranceFeesTotal,
        otherTotal,
        subtotal,
        discount,
        grandTotal,
        advancePayment,
        balancePayment,
    };
};

const buildQuotationPayload = (body, existingQuotation = null) => {
    const totals = calculateQuotationTotals(body);

    return {
        quotationNo:
            existingQuotation?.quotationNo || body.quotationNo || generateQuotationNo(),

        inquiry: body.inquiry || null,
        booking: body.booking || null,

        clientName: safeText(body.clientName),
        country: safeText(body.country),
        tourTitle: safeText(body.tourTitle),

        travelStartDate: body.travelStartDate || null,
        travelEndDate: body.travelEndDate || null,

        travelers: Math.max(toNumber(body.travelers), 0),
        durationDays: totals.durationDays,

        vehicleType: body.vehicleType || "Private Vehicle",
        vehicleDailyRate: totals.vehicleDailyRate,
        vehicleDays: totals.vehicleDays,

        hotelCost: totals.hotelTotal,
        activitiesCost: totals.activitiesTotal,
        entranceFeesCost: totals.entranceFeesTotal,
        otherCost: totals.otherTotal,

        discount: totals.discount,
        advancePayment: totals.advancePayment,

        currency: body.currency || "USD",

        totals: {
            vehicleTotal: totals.vehicleTotal,
            hotelTotal: totals.hotelTotal,
            activitiesTotal: totals.activitiesTotal,
            entranceFeesTotal: totals.entranceFeesTotal,
            otherTotal: totals.otherTotal,
            subtotal: totals.subtotal,
            discount: totals.discount,
            grandTotal: totals.grandTotal,
            advancePayment: totals.advancePayment,
            balancePayment: totals.balancePayment,
        },

        inclusions: parseList(body.inclusions, []),
        exclusions: parseList(body.exclusions, []),
        notes: safeText(body.notes),

        status: body.status || existingQuotation?.status || "Draft",
        sentDate: body.sentDate || existingQuotation?.sentDate || null,
        acceptedDate: body.acceptedDate || existingQuotation?.acceptedDate || null,
        adminNotes: safeText(body.adminNotes || existingQuotation?.adminNotes || ""),
    };
};


const createQuotation = async (req, res) => {
    try {
        const { clientName, tourTitle } = req.body;

        if (!clientName || !tourTitle) {
            return res.status(400).json({
                message: "Client name and tour title are required",
            });
        }

        const payload = buildQuotationPayload(req.body);

        const quotation = await Quotation.create(payload);

        res.status(201).json({
            message: "Quotation saved successfully",
            quotation,
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to save quotation",
            error: error.message,
        });
    }
};


const getQuotations = async (req, res) => {
    try {
        const {
            keyword,
            status,
            currency,
            page = 1,
            limit = 10,
        } = req.query;

        const query = {};

        if (keyword) {
            query.$or = [
                { quotationNo: { $regex: keyword, $options: "i" } },
                { clientName: { $regex: keyword, $options: "i" } },
                { country: { $regex: keyword, $options: "i" } },
                { tourTitle: { $regex: keyword, $options: "i" } },
            ];
        }

        if (status) {
            query.status = status;
        }

        if (currency) {
            query.currency = currency;
        }

        const currentPage = Number(page);
        const pageLimit = Number(limit);
        const skip = (currentPage - 1) * pageLimit;

        const totalQuotations = await Quotation.countDocuments(query);

        const quotations = await Quotation.find(query)
            .populate("inquiry", "fullName email whatsappNumber country status")
            .populate("booking", "bookingCode bookingStatus paymentStatus")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(pageLimit);

        res.status(200).json({
            quotations,
            currentPage,
            totalPages: Math.ceil(totalQuotations / pageLimit),
            totalQuotations,
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to fetch quotations",
            error: error.message,
        });
    }
};


const getQuotationById = async (req, res) => {
    try {
        const quotation = await Quotation.findById(req.params.id)
            .populate("inquiry", "fullName email whatsappNumber country status")
            .populate("booking", "bookingCode bookingStatus paymentStatus");

        if (!quotation) {
            return res.status(404).json({
                message: "Quotation not found",
            });
        }

        res.status(200).json(quotation);
    } catch (error) {
        res.status(500).json({
            message: "Failed to fetch quotation",
            error: error.message,
        });
    }
};


const updateQuotation = async (req, res) => {
    try {
        const quotation = await Quotation.findById(req.params.id);

        if (!quotation) {
            return res.status(404).json({
                message: "Quotation not found",
            });
        }

        const payload = buildQuotationPayload(req.body, quotation);

        const updatedQuotation = await Quotation.findByIdAndUpdate(
            req.params.id,
            payload,
            {
                new: true,
                runValidators: true,
            }
        );

        res.status(200).json({
            message: "Quotation updated successfully",
            quotation: updatedQuotation,
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to update quotation",
            error: error.message,
        });
    }
};


const deleteQuotation = async (req, res) => {
    try {
        const quotation = await Quotation.findById(req.params.id);

        if (!quotation) {
            return res.status(404).json({
                message: "Quotation not found",
            });
        }

        await quotation.deleteOne();

        res.status(200).json({
            message: "Quotation deleted successfully",
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to delete quotation",
            error: error.message,
        });
    }
};

module.exports = {
    createQuotation,
    getQuotations,
    getQuotationById,
    updateQuotation,
    deleteQuotation,
};
