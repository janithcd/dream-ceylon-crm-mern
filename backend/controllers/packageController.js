const TourPackage = require("../models/TourPackage");

// @desc    Create tour package
// @route   POST /api/packages
// @access  Private
const createPackage = async (req, res) => {
    try {
        const {
            title,
            durationDays,
            category,
            overview,
            destinations,
            priceFrom,
            currency,
            inclusions,
            exclusions,
            itinerary,
            imageUrl,
            isFeatured,
            status,
        } = req.body;

        if (!title || !durationDays || !overview || priceFrom === undefined) {
            return res.status(400).json({
                message: "Please provide title, duration, overview, and starting price",
            });
        }

        const packageExists = await TourPackage.findOne({ title });

        if (packageExists) {
            return res.status(400).json({
                message: "Package already exists with this title",
            });
        }

        const tourPackage = await TourPackage.create({
            title,
            durationDays,
            category,
            overview,
            destinations,
            priceFrom,
            currency,
            inclusions,
            exclusions,
            itinerary,
            imageUrl,
            isFeatured,
            status,
        });

        const populatedPackage = await TourPackage.findById(tourPackage._id).populate(
            "destinations",
            "name province category imageUrl"
        );

        res.status(201).json(populatedPackage);
    } catch (error) {
        res.status(500).json({
            message: "Server error",
            error: error.message,
        });
    }
};

// @desc    Get all tour packages with search, filter, and pagination
// @route   GET /api/packages
// @access  Private
const getPackages = async (req, res) => {
    try {
        const {
            keyword,
            category,
            status,
            isFeatured,
            page = 1,
            limit = 10,
        } = req.query;

        const query = {};

        if (keyword) {
            query.$or = [
                { title: { $regex: keyword, $options: "i" } },
                { overview: { $regex: keyword, $options: "i" } },
            ];
        }

        if (category) {
            query.category = category;
        }

        if (status) {
            query.status = status;
        }

        if (isFeatured !== undefined) {
            query.isFeatured = isFeatured === "true";
        }

        const pageNumber = Number(page);
        const pageSize = Number(limit);

        const totalPackages = await TourPackage.countDocuments(query);

        const packages = await TourPackage.find(query)
            .populate("destinations", "name province category imageUrl")
            .sort({ createdAt: -1 })
            .skip((pageNumber - 1) * pageSize)
            .limit(pageSize);

        res.status(200).json({
            packages,
            currentPage: pageNumber,
            totalPages: Math.ceil(totalPackages / pageSize),
            totalPackages,
        });
    } catch (error) {
        res.status(500).json({
            message: "Server error",
            error: error.message,
        });
    }
};

// @desc    Get single tour package
// @route   GET /api/packages/:id
// @access  Private
const getPackageById = async (req, res) => {
    try {
        const tourPackage = await TourPackage.findById(req.params.id).populate(
            "destinations",
            "name province category imageUrl shortDescription"
        );

        if (!tourPackage) {
            return res.status(404).json({
                message: "Package not found",
            });
        }

        res.status(200).json(tourPackage);
    } catch (error) {
        res.status(500).json({
            message: "Server error",
            error: error.message,
        });
    }
};

// @desc    Update tour package
// @route   PUT /api/packages/:id
// @access  Private
const updatePackage = async (req, res) => {
    try {
        const tourPackage = await TourPackage.findById(req.params.id);

        if (!tourPackage) {
            return res.status(404).json({
                message: "Package not found",
            });
        }

        const updatedPackage = await TourPackage.findByIdAndUpdate(
            req.params.id,
            req.body,
            {
                new: true,
                runValidators: true,
            }
        ).populate("destinations", "name province category imageUrl");

        res.status(200).json(updatedPackage);
    } catch (error) {
        res.status(500).json({
            message: "Server error",
            error: error.message,
        });
    }
};

// @desc    Delete tour package
// @route   DELETE /api/packages/:id
// @access  Private
const deletePackage = async (req, res) => {
    try {
        const tourPackage = await TourPackage.findById(req.params.id);

        if (!tourPackage) {
            return res.status(404).json({
                message: "Package not found",
            });
        }

        await TourPackage.findByIdAndDelete(req.params.id);

        res.status(200).json({
            message: "Package deleted successfully",
        });
    } catch (error) {
        res.status(500).json({
            message: "Server error",
            error: error.message,
        });
    }
};

module.exports = {
    createPackage,
    getPackages,
    getPackageById,
    updatePackage,
    deletePackage,
};