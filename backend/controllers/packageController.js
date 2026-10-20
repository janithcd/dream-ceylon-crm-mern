const TourPackage = require(
    "../models/TourPackage"
);

const TOUR_TYPES = [
    "Multi-Day Tour",
    "Day Tour",
];

const DEFAULT_TOUR_TYPE =
    "Multi-Day Tour";

function normalizeTourType(value) {
    return TOUR_TYPES.includes(value)
        ? value
        : DEFAULT_TOUR_TYPE;
}

function normalizeOptionalNumber(value) {
    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return null;
    }

    return Number(value);
}

function validateTourConfiguration({
                                       tourType,
                                       durationDays,
                                       durationHours,
                                       minTravelers,
                                       maxTravelers,
                                   }) {
    if (
        tourType === "Multi-Day Tour" &&
        (
            !Number.isFinite(durationDays) ||
            durationDays < 1
        )
    ) {
        return "Multi-day tours require a valid duration in days";
    }

    if (
        tourType === "Day Tour" &&
        (
            !Number.isFinite(durationHours) ||
            durationHours < 1 ||
            durationHours > 24
        )
    ) {
        return "Day tours require a duration between 1 and 24 hours";
    }

    if (
        !Number.isFinite(minTravelers) ||
        minTravelers < 1
    ) {
        return "Minimum travellers must be at least 1";
    }

    if (
        maxTravelers !== null &&
        (
            !Number.isFinite(maxTravelers) ||
            maxTravelers < minTravelers
        )
    ) {
        return "Maximum travellers cannot be lower than minimum travellers";
    }

    return null;
}

function applyTourTypeFilter(
    query,
    tourType
) {
    if (
        tourType ===
        "Multi-Day Tour"
    ) {
        query.$and = [
            ...(query.$and || []),

            {
                $or: [
                    {
                        tourType:
                            "Multi-Day Tour",
                    },
                    {
                        tourType: {
                            $exists: false,
                        },
                    },
                    {
                        tourType: null,
                    },
                ],
            },
        ];

        return;
    }

    if (
        tourType ===
        "Day Tour"
    ) {
        query.tourType =
            "Day Tour";
    }
}

const createPackage = async (
    req,
    res
) => {
    try {
        const {
            title,
            tourType,
            durationDays,
            durationHours,
            category,
            overview,
            highlights,
            destinations,
            startLocation,
            endLocation,
            pickupAvailable,
            pickupDetails,
            startTime,
            returnTime,
            priceFrom,
            currency,
            pricingBasis,
            minTravelers,
            maxTravelers,
            inclusions,
            exclusions,
            itinerary,
            imageUrl,
            isFeatured,
            status,
        } = req.body;

        const resolvedTourType =
            normalizeTourType(
                tourType
            );

        const resolvedDurationDays =
            resolvedTourType ===
            "Day Tour"
                ? Number(
                    durationDays || 1
                )
                : Number(
                    durationDays
                );

        const resolvedDurationHours =
            normalizeOptionalNumber(
                durationHours
            );

        const resolvedMinTravelers =
            Number(
                minTravelers || 1
            );

        const resolvedMaxTravelers =
            normalizeOptionalNumber(
                maxTravelers
            );

        if (
            !title ||
            !overview ||
            priceFrom === undefined ||
            priceFrom === null
        ) {
            return res
                .status(400)
                .json({
                    message:
                        "Please provide title, overview, and starting price",
                });
        }

        const validationError =
            validateTourConfiguration({
                tourType:
                resolvedTourType,

                durationDays:
                resolvedDurationDays,

                durationHours:
                resolvedDurationHours,

                minTravelers:
                resolvedMinTravelers,

                maxTravelers:
                resolvedMaxTravelers,
            });

        if (validationError) {
            return res
                .status(400)
                .json({
                    message:
                    validationError,
                });
        }

        const packageExists =
            await TourPackage.findOne({
                title: title.trim(),
            });

        if (packageExists) {
            return res
                .status(400)
                .json({
                    message:
                        "Package already exists with this title",
                });
        }

        const tourPackage =
            await TourPackage.create({
                title,
                tourType:
                resolvedTourType,

                durationDays:
                resolvedDurationDays,

                durationHours:
                resolvedDurationHours,

                category,
                overview,
                highlights,
                destinations,
                startLocation,
                endLocation,
                pickupAvailable,
                pickupDetails,
                startTime,
                returnTime,
                priceFrom,
                currency,
                pricingBasis,

                minTravelers:
                resolvedMinTravelers,

                maxTravelers:
                resolvedMaxTravelers,

                inclusions,
                exclusions,
                itinerary,
                imageUrl,
                isFeatured,
                status,
            });

        const populatedPackage =
            await TourPackage
                .findById(
                    tourPackage._id
                )
                .populate(
                    "destinations",
                    "name province category imageUrl shortDescription"
                );

        res.status(201).json(
            populatedPackage
        );
    } catch (error) {
        res.status(500).json({
            message:
                "Server error",

            error:
            error.message,
        });
    }
};

const getPackages = async (
    req,
    res
) => {
    try {
        const {
            keyword,
            tourType,
            category,
            status,
            isFeatured,
            page = 1,
            limit = 10,
        } = req.query;

        if (
            tourType &&
            !TOUR_TYPES.includes(
                tourType
            )
        ) {
            return res
                .status(400)
                .json({
                    message:
                        "Invalid tour type",
                });
        }

        const query = {};

        if (keyword) {
            query.$or = [
                {
                    title: {
                        $regex:
                        keyword,

                        $options:
                            "i",
                    },
                },
                {
                    overview: {
                        $regex:
                        keyword,

                        $options:
                            "i",
                    },
                },
                {
                    startLocation: {
                        $regex:
                        keyword,

                        $options:
                            "i",
                    },
                },
            ];
        }

        applyTourTypeFilter(
            query,
            tourType
        );

        if (category) {
            query.category =
                category;
        }

        if (status) {
            query.status =
                status;
        }

        if (
            isFeatured !== undefined
        ) {
            query.isFeatured =
                isFeatured === "true";
        }

        const pageNumber =
            Math.max(
                Number(page) || 1,
                1
            );

        const pageSize =
            Math.min(
                Math.max(
                    Number(limit) ||
                    10,
                    1
                ),
                100
            );

        const totalPackages =
            await TourPackage.countDocuments(
                query
            );

        const packages =
            await TourPackage
                .find(query)
                .populate(
                    "destinations",
                    "name province category imageUrl shortDescription"
                )
                .sort({
                    createdAt: -1,
                })
                .skip(
                    (
                        pageNumber -
                        1
                    ) *
                    pageSize
                )
                .limit(
                    pageSize
                );

        res.status(200).json({
            packages,
            currentPage:
            pageNumber,

            totalPages:
                Math.ceil(
                    totalPackages /
                    pageSize
                ),

            totalPackages,
        });
    } catch (error) {
        res.status(500).json({
            message:
                "Server error",

            error:
            error.message,
        });
    }
};

const getPackageById = async (
    req,
    res
) => {
    try {
        const tourPackage =
            await TourPackage
                .findById(
                    req.params.id
                )
                .populate(
                    "destinations",
                    "name province category imageUrl shortDescription"
                );

        if (!tourPackage) {
            return res
                .status(404)
                .json({
                    message:
                        "Package not found",
                });
        }

        res.status(200).json(
            tourPackage
        );
    } catch (error) {
        res.status(500).json({
            message:
                "Server error",

            error:
            error.message,
        });
    }
};

const updatePackage = async (
    req,
    res
) => {
    try {
        const tourPackage =
            await TourPackage.findById(
                req.params.id
            );

        if (!tourPackage) {
            return res
                .status(404)
                .json({
                    message:
                        "Package not found",
                });
        }

        const resolvedTourType =
            normalizeTourType(
                req.body.tourType ??
                tourPackage.tourType ??
                DEFAULT_TOUR_TYPE
            );

        const currentDurationDays =
            req.body.durationDays ??
            tourPackage.durationDays;

        const resolvedDurationDays =
            resolvedTourType ===
            "Day Tour"
                ? Number(
                    currentDurationDays ||
                    1
                )
                : Number(
                    currentDurationDays
                );

        const resolvedDurationHours =
            normalizeOptionalNumber(
                req.body
                    .durationHours ??
                tourPackage
                    .durationHours
            );

        const resolvedMinTravelers =
            Number(
                req.body
                    .minTravelers ??
                tourPackage
                    .minTravelers ??
                1
            );

        const resolvedMaxTravelers =
            normalizeOptionalNumber(
                req.body
                    .maxTravelers ??
                tourPackage
                    .maxTravelers
            );

        const validationError =
            validateTourConfiguration({
                tourType:
                resolvedTourType,

                durationDays:
                resolvedDurationDays,

                durationHours:
                resolvedDurationHours,

                minTravelers:
                resolvedMinTravelers,

                maxTravelers:
                resolvedMaxTravelers,
            });

        if (validationError) {
            return res
                .status(400)
                .json({
                    message:
                    validationError,
                });
        }

        const updateData = {
            ...req.body,

            tourType:
            resolvedTourType,

            durationDays:
            resolvedDurationDays,

            durationHours:
            resolvedDurationHours,

            minTravelers:
            resolvedMinTravelers,

            maxTravelers:
            resolvedMaxTravelers,
        };

        const updatedPackage =
            await TourPackage
                .findByIdAndUpdate(
                    req.params.id,
                    updateData,
                    {
                        new: true,
                        runValidators:
                            true,
                    }
                )
                .populate(
                    "destinations",
                    "name province category imageUrl shortDescription"
                );

        res.status(200).json(
            updatedPackage
        );
    } catch (error) {
        res.status(500).json({
            message:
                "Server error",

            error:
            error.message,
        });
    }
};

const deletePackage = async (
    req,
    res
) => {
    try {
        const tourPackage =
            await TourPackage.findById(
                req.params.id
            );

        if (!tourPackage) {
            return res
                .status(404)
                .json({
                    message:
                        "Package not found",
                });
        }

        await TourPackage.findByIdAndDelete(
            req.params.id
        );

        res.status(200).json({
            message:
                "Package deleted successfully",
        });
    } catch (error) {
        res.status(500).json({
            message:
                "Server error",

            error:
            error.message,
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