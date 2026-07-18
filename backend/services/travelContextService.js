const Destination = require(
    "../models/Destination"
);

const TourPackage = require(
    "../models/TourPackage"
);

const Vehicle = require(
    "../models/Vehicle"
);

const CONTEXT_CACHE_DURATION_MS =
    5 * 60 * 1000;

let cachedContext = null;
let cacheExpiresAt = 0;

const faqContext = [
    {
        question:
            "Can travellers customise their Sri Lanka itinerary?",
        answer:
            "Yes. Private journeys can be adjusted according to travel dates, interests, pace, accommodation preference, group size, and budget.",
    },
    {
        question:
            "What can tour packages include?",
        answer:
            "Depending on the quotation, packages may include a private air-conditioned vehicle, chauffeur-guide, airport transfers, route planning, daily transport, and bottled water.",
    },
    {
        question:
            "Are hotels, entrance fees, activities, and meals included?",
        answer:
            "They may be included or excluded depending on the selected package and customer requirements. The final quotation clearly lists all inclusions and exclusions.",
    },
    {
        question:
            "How is the vehicle selected?",
        answer:
            "Vehicles are recommended according to passenger count, luggage, route, tour duration, and preferred comfort level.",
    },
    {
        question:
            "Can Dream Ceylon support travel agents and B2B partners?",
        answer:
            "Yes. Dream Ceylon supports travel agents, overseas tour operators, and B2B partners with ground handling, private transport, chauffeur-guides, itinerary support, airport transfers, and client movement throughout Sri Lanka.",
    },
];

function cleanText(
    value,
    maximumLength = 800
) {
    return String(value ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maximumLength);
}

function normalizeList(
    value,
    maximumItems = 6
) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item) =>
            cleanText(item, 160)
        )
        .filter(Boolean)
        .slice(0, maximumItems);
}

function mapDestination(destination) {
    return {
        id:
            destination._id?.toString() ??
            null,

        name:
            cleanText(
                destination.name,
                100
            ),

        province:
            cleanText(
                destination.province,
                100
            ),

        category:
            cleanText(
                destination.category,
                80
            ),

        description:
            cleanText(
                destination.shortDescription,
                400
            ),

        bestFor:
            cleanText(
                destination.bestFor,
                250
            ),
    };
}

function mapPackage(tourPackage) {
    return {
        id:
            tourPackage._id?.toString() ??
            null,

        title:
            cleanText(
                tourPackage.title,
                140
            ),

        durationDays:
            Number(
                tourPackage.durationDays
            ) || null,

        category:
            cleanText(
                tourPackage.category,
                80
            ),

        overview:
            cleanText(
                tourPackage.overview,
                600
            ),

        destinations:
            Array.isArray(
                tourPackage.destinations
            )
                ? tourPackage.destinations
                    .map((destination) =>
                        cleanText(
                            destination?.name,
                            100
                        )
                    )
                    .filter(Boolean)
                    .slice(0, 12)
                : [],

        priceFrom:
            Number.isFinite(
                Number(
                    tourPackage.priceFrom
                )
            )
                ? Number(
                    tourPackage.priceFrom
                )
                : null,

        currency:
            cleanText(
                tourPackage.currency,
                10
            ) || "USD",

        inclusions:
            normalizeList(
                tourPackage.inclusions
            ),

        exclusions:
            normalizeList(
                tourPackage.exclusions
            ),
    };
}

function mapVehicle(vehicle) {
    return {
        id:
            vehicle._id?.toString() ??
            null,

        name:
            cleanText(
                vehicle.name,
                120
            ),

        type:
            cleanText(
                vehicle.type,
                60
            ),

        capacity:
            Number(
                vehicle.capacity
            ) || null,

        pricePerDay:
            Number.isFinite(
                Number(
                    vehicle.pricePerDay
                )
            )
                ? Number(
                    vehicle.pricePerDay
                )
                : null,

        currency:
            cleanText(
                vehicle.currency,
                10
            ) || "USD",

        description:
            cleanText(
                vehicle.description,
                400
            ),

        features:
            normalizeList(
                vehicle.features
            ),
    };
}

async function buildTravelContext() {
    const [
        destinations,
        packages,
        vehicles,
    ] = await Promise.all([
        Destination.find({
            status: "Active",
        })
            .select(
                "name province category shortDescription bestFor"
            )
            .sort({
                isPopular: -1,
                createdAt: -1,
            })
            .limit(30)
            .lean(),

        TourPackage.find({
            status: "Active",
        })
            .select(
                "title durationDays category overview destinations priceFrom currency inclusions exclusions"
            )
            .populate(
                "destinations",
                "name"
            )
            .sort({
                isFeatured: -1,
                createdAt: -1,
            })
            .limit(20)
            .lean(),

        Vehicle.find({
            status: "Active",
        })
            .select(
                "name type capacity pricePerDay currency description features"
            )
            .sort({
                pricePerDay: 1,
            })
            .limit(10)
            .lean(),
    ]);

    return {
        company: {
            name:
                "Dream Ceylon Journeys",

            type:
                "Sri Lanka destination management company and private tour operator",

            email:
                "info@dreamceylonjourneys.com",

            phone:
                "+94 77 512 4645",

            whatsapp:
                "+94 77 512 4645",

            location:
                "Sri Lanka",

            services: [
                "Private Sri Lanka tours",
                "Custom itineraries",
                "Private air-conditioned transport",
                "Chauffeur-guides",
                "Airport transfers",
                "Ground handling",
                "Travel agent and B2B support",
            ],
        },

        destinations:
            destinations.map(
                mapDestination
            ),

        packages:
            packages.map(
                mapPackage
            ),

        vehicles:
            vehicles.map(
                mapVehicle
            ),

        frequentlyAskedQuestions:
        faqContext,

        importantNotes: [
            "Package prices are starting prices and require final confirmation.",
            "Vehicle suitability depends on passenger count, luggage, route, and availability.",
            "Train tickets, hotel availability, safari schedules, entrance fees, and activity availability must be confirmed by the travel team.",
            "A chatbot conversation does not confirm a reservation.",
        ],

        generatedAt:
            new Date().toISOString(),
    };
}

async function getTravelContext({
                                    forceRefresh = false,
                                } = {}) {
    const now = Date.now();

    if (
        !forceRefresh &&
        cachedContext &&
        now < cacheExpiresAt
    ) {
        return cachedContext;
    }

    cachedContext =
        await buildTravelContext();

    cacheExpiresAt =
        now +
        CONTEXT_CACHE_DURATION_MS;

    return cachedContext;
}

function clearTravelContextCache() {
    cachedContext = null;
    cacheExpiresAt = 0;
}

module.exports = {
    getTravelContext,
    clearTravelContextCache,
};