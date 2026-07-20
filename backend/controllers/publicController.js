const Destination = require(
    "../models/Destination"
);

const TourPackage = require(
    "../models/TourPackage"
);

const Vehicle = require(
    "../models/Vehicle"
);

const TOUR_TYPES = [
    "Multi-Day Tour",
    "Day Tour",
];

const PUBLIC_PACKAGE_FIELDS = [
    "title",
    "tourType",
    "durationDays",
    "durationHours",
    "category",
    "overview",
    "highlights",
    "destinations",
    "startLocation",
    "endLocation",
    "pickupAvailable",
    "pickupDetails",
    "startTime",
    "returnTime",
    "priceFrom",
    "currency",
    "pricingBasis",
    "minTravelers",
    "maxTravelers",
    "inclusions",
    "exclusions",
    "itinerary",
    "imageUrl",
    "isFeatured",
    "createdAt",
    "updatedAt",
].join(" ");

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

const getPublicHomeData = async (
    req,
    res
) => {
    try {
        const [
            popularDestinations,
            featuredPackages,
            featuredDayTours,
            featuredVehicles,
        ] =
            await Promise.all([
                Destination.find({
                    status:
                        "Active",

                    isPopular:
                        true,
                })
                    .select(
                        "name province category shortDescription imageUrl bestFor isPopular"
                    )
                    .sort({
                        createdAt:
                            -1,
                    })
                    .limit(6),

                TourPackage.find({
                    status:
                        "Active",

                    isFeatured:
                        true,

                    $or: [
                        {
                            tourType:
                                "Multi-Day Tour",
                        },
                        {
                            tourType: {
                                $exists:
                                    false,
                            },
                        },
                        {
                            tourType:
                                null,
                        },
                    ],
                })
                    .select(
                        PUBLIC_PACKAGE_FIELDS
                    )
                    .populate(
                        "destinations",
                        "name province category imageUrl shortDescription"
                    )
                    .sort({
                        createdAt:
                            -1,
                    })
                    .limit(6),

                TourPackage.find({
                    status:
                        "Active",

                    isFeatured:
                        true,

                    tourType:
                        "Day Tour",
                })
                    .select(
                        PUBLIC_PACKAGE_FIELDS
                    )
                    .populate(
                        "destinations",
                        "name province category imageUrl shortDescription"
                    )
                    .sort({
                        createdAt:
                            -1,
                    })
                    .limit(6),

                Vehicle.find({
                    status:
                        "Active",

                    isFeatured:
                        true,
                })
                    .select(
                        "name type capacity pricePerDay currency imageUrl description features isFeatured"
                    )
                    .sort({
                        pricePerDay:
                            1,
                    })
                    .limit(6),
            ]);

        res.status(200).json({
            popularDestinations,
            featuredPackages,
            featuredDayTours,
            featuredVehicles,
        });
    } catch (error) {
        res.status(500).json({
            message:
                "Failed to fetch public homepage data",

            error:
            error.message,
        });
    }
};

const getPublicDestinations = async (
    req,
    res
) => {
    try {
        const {
            keyword,
            category,
            isPopular,
            page = 1,
            limit = 12,
        } = req.query;

        const query = {
            status: "Active",
        };

        if (keyword) {
            query.$or = [
                {
                    name: {
                        $regex:
                        keyword,

                        $options:
                            "i",
                    },
                },
                {
                    province: {
                        $regex:
                        keyword,

                        $options:
                            "i",
                    },
                },
                {
                    category: {
                        $regex:
                        keyword,

                        $options:
                            "i",
                    },
                },
                {
                    shortDescription: {
                        $regex:
                        keyword,

                        $options:
                            "i",
                    },
                },
            ];
        }

        if (category) {
            query.category =
                category;
        }

        if (
            isPopular !== undefined
        ) {
            query.isPopular =
                isPopular === "true";
        }

        const currentPage =
            Math.max(
                Number(page) || 1,
                1
            );

        const pageLimit =
            Math.min(
                Math.max(
                    Number(limit) ||
                    12,
                    1
                ),
                100
            );

        const skip =
            (
                currentPage -
                1
            ) *
            pageLimit;

        const totalDestinations =
            await Destination.countDocuments(
                query
            );

        const destinations =
            await Destination
                .find(query)
                .select(
                    "name province category shortDescription description imageUrl bestFor isPopular"
                )
                .sort({
                    createdAt:
                        -1,
                })
                .skip(skip)
                .limit(
                    pageLimit
                );

        res.status(200).json({
            destinations,
            currentPage,

            totalPages:
                Math.ceil(
                    totalDestinations /
                    pageLimit
                ),

            totalDestinations,
        });
    } catch (error) {
        res.status(500).json({
            message:
                "Failed to fetch public destinations",

            error:
            error.message,
        });
    }
};

const getPublicDestinationById =
    async (
        req,
        res
    ) => {
        try {
            const destination =
                await Destination
                    .findOne({
                        _id:
                        req.params.id,

                        status:
                            "Active",
                    })
                    .select(
                        "name province category shortDescription description imageUrl bestFor isPopular"
                    );

            if (!destination) {
                return res
                    .status(404)
                    .json({
                        message:
                            "Destination not found",
                    });
            }

            res.status(200).json(
                destination
            );
        } catch (error) {
            res.status(500).json({
                message:
                    "Failed to fetch public destination",

                error:
                error.message,
            });
        }
    };

const getPublicPackages = async (
    req,
    res
) => {
    try {
        const {
            keyword,
            tourType,
            category,
            isFeatured,
            page = 1,
            limit = 12,
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

        const query = {
            status: "Active",
        };

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
                    category: {
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

        if (
            isFeatured !== undefined
        ) {
            query.isFeatured =
                isFeatured === "true";
        }

        const currentPage =
            Math.max(
                Number(page) || 1,
                1
            );

        const pageLimit =
            Math.min(
                Math.max(
                    Number(limit) ||
                    12,
                    1
                ),
                100
            );

        const skip =
            (
                currentPage -
                1
            ) *
            pageLimit;

        const totalPackages =
            await TourPackage.countDocuments(
                query
            );

        const packages =
            await TourPackage
                .find(query)
                .select(
                    PUBLIC_PACKAGE_FIELDS
                )
                .populate(
                    "destinations",
                    "name province category imageUrl shortDescription"
                )
                .sort({
                    createdAt:
                        -1,
                })
                .skip(skip)
                .limit(
                    pageLimit
                );

        res.status(200).json({
            packages,
            currentPage,

            totalPages:
                Math.ceil(
                    totalPackages /
                    pageLimit
                ),

            totalPackages,
        });
    } catch (error) {
        res.status(500).json({
            message:
                "Failed to fetch public packages",

            error:
            error.message,
        });
    }
};

const getPublicPackageById =
    async (
        req,
        res
    ) => {
        try {
            const tourPackage =
                await TourPackage
                    .findOne({
                        _id:
                        req.params.id,

                        status:
                            "Active",
                    })
                    .select(
                        PUBLIC_PACKAGE_FIELDS
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
                    "Failed to fetch public package",

                error:
                error.message,
            });
        }
    };

const getPublicVehicles = async (
    req,
    res
) => {
    try {
        const {
            type,
            isFeatured,
            page = 1,
            limit = 12,
        } = req.query;

        const query = {
            status: "Active",
        };

        if (type) {
            query.type = type;
        }

        if (
            isFeatured !== undefined
        ) {
            query.isFeatured =
                isFeatured === "true";
        }

        const currentPage =
            Math.max(
                Number(page) || 1,
                1
            );

        const pageLimit =
            Math.min(
                Math.max(
                    Number(limit) ||
                    12,
                    1
                ),
                100
            );

        const skip =
            (
                currentPage -
                1
            ) *
            pageLimit;

        const totalVehicles =
            await Vehicle.countDocuments(
                query
            );

        const vehicles =
            await Vehicle
                .find(query)
                .select(
                    "name type capacity pricePerDay currency imageUrl description features isFeatured"
                )
                .sort({
                    pricePerDay:
                        1,
                })
                .skip(skip)
                .limit(
                    pageLimit
                );

        res.status(200).json({
            vehicles,
            currentPage,

            totalPages:
                Math.ceil(
                    totalVehicles /
                    pageLimit
                ),

            totalVehicles,
        });
    } catch (error) {
        res.status(500).json({
            message:
                "Failed to fetch public vehicles",

            error:
            error.message,
        });
    }
};

module.exports = {
    getPublicHomeData,
    getPublicDestinations,
    getPublicDestinationById,
    getPublicPackages,
    getPublicPackageById,
    getPublicVehicles,
};