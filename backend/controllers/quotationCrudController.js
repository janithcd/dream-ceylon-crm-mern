const mongoose = require("mongoose");
const Quotation = require("../models/Quotation");
const { createActivityLog } = require("../utils/createActivityLog");

const safeText = (value) => {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
};

const toNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
};

const escapeRegex = (value) => {
    return safeText(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const buildRegex = (value) => ({
    $regex: escapeRegex(value),
    $options: "i",
});

const parsePositiveInteger = (value, fallback) => {
    const number = Number.parseInt(value, 10);

    if (!Number.isFinite(number) || number < 1) {
        return fallback;
    }

    return number;
};

const normalizeObjectId = (value) => {
    const candidate =
        value && typeof value === "object" ? value._id || value.id : value;

    if (!candidate || !mongoose.Types.ObjectId.isValid(candidate)) {
        return null;
    }

    return candidate;
};

const parseList = (value) => {
    if (Array.isArray(value)) {
        return value.map((item) => safeText(item)).filter(Boolean);
    }

    if (typeof value === "string") {
        return value
            .split(/\r?\n|,/)
            .map((item) => safeText(item))
            .filter(Boolean);
    }

    return [];
};

const calculateQuotationTotals = (body) => {
    const durationDays = Math.max(toNumber(body.durationDays), 0);
    const vehicleDays = Math.max(
        toNumber(body.vehicleDays || durationDays),
        0
    );
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

const generateQuotationNo = async () => {
    const year = new Date().getFullYear();

    for (let attempt = 0; attempt < 10; attempt += 1) {
        const randomPart = Math.floor(100000 + Math.random() * 900000);
        const quotationNo = `DCJ-Q-${year}-${randomPart}`;
        const exists = await Quotation.exists({ quotationNo });

        if (!exists) {
            return quotationNo;
        }
    }

    return `DCJ-Q-${year}-${Date.now().toString().slice(-8)}`;
};

const populateQuotation = (query) => {
    return query
        .populate(
            "inquiry",
            "fullName email whatsappNumber country travelDate numberOfTravelers status interestedPackage"
        )
        .populate("booking", "bookingCode bookingStatus paymentStatus customer")
        .populate("inquiry.interestedPackage", "title durationDays category");
};

const buildQuotationQuery = (queryParams) => {
    const { keyword, status, currency } = queryParams;
    const query = {};

    if (status) {
        query.status = status;
    }

    if (currency) {
        query.currency = currency;
    }

    if (keyword) {
        query.$or = [
            { quotationNo: buildRegex(keyword) },
            { clientName: buildRegex(keyword) },
            { country: buildRegex(keyword) },
            { tourTitle: buildRegex(keyword) },
            { notes: buildRegex(keyword) },
            { adminNotes: buildRegex(keyword) },
        ];
    }

    return query;
};

const buildQuotationPayload = (body, existingQuotation = null) => {
    const totals = calculateQuotationTotals({
        durationDays:
            body.durationDays !== undefined
                ? body.durationDays
                : existingQuotation?.durationDays,
        vehicleDays:
            body.vehicleDays !== undefined
                ? body.vehicleDays
                : existingQuotation?.vehicleDays,
        vehicleDailyRate:
            body.vehicleDailyRate !== undefined
                ? body.vehicleDailyRate
                : existingQuotation?.vehicleDailyRate,
        hotelCost:
            body.hotelCost !== undefined
                ? body.hotelCost
                : existingQuotation?.hotelCost,
        activitiesCost:
            body.activitiesCost !== undefined
                ? body.activitiesCost
                : existingQuotation?.activitiesCost,
        entranceFeesCost:
            body.entranceFeesCost !== undefined
                ? body.entranceFeesCost
                : existingQuotation?.entranceFeesCost,
        otherCost:
            body.otherCost !== undefined
                ? body.otherCost
                : existingQuotation?.otherCost,
        discount:
            body.discount !== undefined
                ? body.discount
                : existingQuotation?.discount,
        advancePayment:
            body.advancePayment !== undefined
                ? body.advancePayment
                : existingQuotation?.advancePayment,
    });

    return {
        inquiry:
            body.inquiry !== undefined
                ? normalizeObjectId(body.inquiry)
                : normalizeObjectId(existingQuotation?.inquiry),
        booking:
            body.booking !== undefined
                ? normalizeObjectId(body.booking)
                : normalizeObjectId(existingQuotation?.booking),
        clientName:
            body.clientName !== undefined
                ? safeText(body.clientName)
                : safeText(existingQuotation?.clientName),
        country:
            body.country !== undefined
                ? safeText(body.country)
                : safeText(existingQuotation?.country),
        tourTitle:
            body.tourTitle !== undefined
                ? safeText(body.tourTitle)
                : safeText(existingQuotation?.tourTitle),
        travelStartDate:
            body.travelStartDate !== undefined
                ? body.travelStartDate || null
                : existingQuotation?.travelStartDate || null,
        travelEndDate:
            body.travelEndDate !== undefined
                ? body.travelEndDate || null
                : existingQuotation?.travelEndDate || null,
        travelers:
            body.travelers !== undefined
                ? Math.max(toNumber(body.travelers), 0)
                : Math.max(toNumber(existingQuotation?.travelers), 0),
        durationDays: totals.durationDays,
        vehicleType:
            body.vehicleType !== undefined
                ? safeText(body.vehicleType)
                : safeText(existingQuotation?.vehicleType) || "Car",
        vehicleDailyRate: totals.vehicleDailyRate,
        vehicleDays: totals.vehicleDays,
        hotelCost: totals.hotelTotal,
        activitiesCost: totals.activitiesTotal,
        entranceFeesCost: totals.entranceFeesTotal,
        otherCost: totals.otherTotal,
        discount: totals.discount,
        advancePayment: totals.advancePayment,
        currency:
            body.currency !== undefined
                ? safeText(body.currency)
                : safeText(existingQuotation?.currency) || "USD",
        status:
            body.status !== undefined
                ? safeText(body.status)
                : safeText(existingQuotation?.status) || "Draft",
        inclusions:
            body.inclusions !== undefined
                ? parseList(body.inclusions)
                : parseList(existingQuotation?.inclusions),
        exclusions:
            body.exclusions !== undefined
                ? parseList(body.exclusions)
                : parseList(existingQuotation?.exclusions),
        notes:
            body.notes !== undefined
                ? safeText(body.notes)
                : safeText(existingQuotation?.notes),
        adminNotes:
            body.adminNotes !== undefined
                ? safeText(body.adminNotes)
                : safeText(existingQuotation?.adminNotes),
        totals,
    };
};

// @desc    Create a saved quotation
// @route   POST /api/quotations
// @access  Private
const createQuotation = async (req, res) => {
    try {
        const payload = buildQuotationPayload(req.body);

        if (!payload.clientName || !payload.tourTitle) {
            return res.status(400).json({
                message: "Client name and tour title are required",
            });
        }

        payload.quotationNo = await generateQuotationNo();

        const quotation = await Quotation.create(payload);

        await createActivityLog({
            req,
            action: "CREATE",
            module: "Quotation",
            description: `Quotation ${quotation.quotationNo} was created for ${quotation.clientName}`,
            relatedRecordId: quotation._id,
            relatedModel: "Quotation",
            referenceNo: quotation.quotationNo,
            customerName: quotation.clientName,
            metadata: {
                tourTitle: quotation.tourTitle,
                status: quotation.status,
                currency: quotation.currency,
                grandTotal: quotation.totals?.grandTotal || 0,
                inquiry: quotation.inquiry,
            },
        });

        const populatedQuotation = await populateQuotation(
            Quotation.findById(quotation._id)
        );

        return res.status(201).json({
            message: "Quotation created successfully",
            quotation: populatedQuotation,
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to create quotation",
            error: error.message,
        });
    }
};

// @desc    Get saved quotations
// @route   GET /api/quotations
// @access  Private
const getQuotations = async (req, res) => {
    try {
        const page = parsePositiveInteger(req.query.page, 1);
        const limit = Math.min(parsePositiveInteger(req.query.limit, 10), 10000);
        const skip = (page - 1) * limit;
        const query = buildQuotationQuery(req.query);

        const [quotations, totalQuotations] = await Promise.all([
            populateQuotation(
                Quotation.find(query)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
            ),
            Quotation.countDocuments(query),
        ]);

        return res.status(200).json({
            quotations,
            currentPage: page,
            totalPages: Math.ceil(totalQuotations / limit) || 1,
            totalQuotations,
            limit,
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to load quotations",
            error: error.message,
        });
    }
};

// @desc    Get one saved quotation
// @route   GET /api/quotations/:id
// @access  Private
const getQuotationById = async (req, res) => {
    try {
        const quotation = await populateQuotation(
            Quotation.findById(req.params.id)
        );

        if (!quotation) {
            return res.status(404).json({
                message: "Quotation not found",
            });
        }

        return res.status(200).json(quotation);
    } catch (error) {
        return res.status(500).json({
            message: "Failed to load quotation",
            error: error.message,
        });
    }
};

// @desc    Update saved quotation
// @route   PUT /api/quotations/:id
// @access  Private
const updateQuotation = async (req, res) => {
    try {
        const quotation = await Quotation.findById(req.params.id);

        if (!quotation) {
            return res.status(404).json({
                message: "Quotation not found",
            });
        }

        const payload = buildQuotationPayload(req.body, quotation);

        if (!payload.clientName || !payload.tourTitle) {
            return res.status(400).json({
                message: "Client name and tour title are required",
            });
        }

        Object.assign(quotation, payload);
        await quotation.save();

        await createActivityLog({
            req,
            action: "UPDATE",
            module: "Quotation",
            description: `Quotation ${quotation.quotationNo} was updated`,
            relatedRecordId: quotation._id,
            relatedModel: "Quotation",
            referenceNo: quotation.quotationNo,
            customerName: quotation.clientName,
            metadata: {
                updatedFields: Object.keys(req.body || {}),
                tourTitle: quotation.tourTitle,
                status: quotation.status,
                currency: quotation.currency,
                grandTotal: quotation.totals?.grandTotal || 0,
            },
        });

        const populatedQuotation = await populateQuotation(
            Quotation.findById(quotation._id)
        );

        return res.status(200).json({
            message: "Quotation updated successfully",
            quotation: populatedQuotation,
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to update quotation",
            error: error.message,
        });
    }
};

// @desc    Delete saved quotation
// @route   DELETE /api/quotations/:id
// @access  Private
const deleteQuotation = async (req, res) => {
    try {
        const quotation = await Quotation.findById(req.params.id);

        if (!quotation) {
            return res.status(404).json({
                message: "Quotation not found",
            });
        }

        const deletedDetails = {
            id: quotation._id,
            quotationNo: quotation.quotationNo,
            clientName: quotation.clientName,
            tourTitle: quotation.tourTitle,
            status: quotation.status,
            currency: quotation.currency,
            grandTotal: quotation.totals?.grandTotal || 0,
            booking: quotation.booking,
        };

        await quotation.deleteOne();

        await createActivityLog({
            req,
            action: "DELETE",
            module: "Quotation",
            description: `Quotation ${deletedDetails.quotationNo} was deleted`,
            relatedRecordId: deletedDetails.id,
            relatedModel: "Quotation",
            referenceNo: deletedDetails.quotationNo,
            customerName: deletedDetails.clientName,
            metadata: {
                tourTitle: deletedDetails.tourTitle,
                status: deletedDetails.status,
                currency: deletedDetails.currency,
                grandTotal: deletedDetails.grandTotal,
                booking: deletedDetails.booking,
            },
        });

        return res.status(200).json({
            message: "Quotation deleted successfully",
        });
    } catch (error) {
        return res.status(500).json({
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
