const mongoose = require("mongoose");

const itineraryDaySchema = new mongoose.Schema(
    {
        day: {
            type: Number,
            required: true,
        },

        title: {
            type: String,
            required: true,
            trim: true,
        },

        description: {
            type: String,
            required: true,
            trim: true,
        },
    },
    {
        _id: false,
    }
);

const tourPackageSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [
                true,
                "Package title is required",
            ],
            trim: true,
            unique: true,
        },

        tourType: {
            type: String,
            enum: [
                "Multi-Day Tour",
                "Day Tour",
            ],
            default: "Multi-Day Tour",
            index: true,
        },

        durationDays: {
            type: Number,
            required: [
                true,
                "Duration in days is required",
            ],
            min: 1,
            default: 1,
        },

        durationHours: {
            type: Number,
            min: 1,
            max: 24,
            default: null,
        },

        category: {
            type: String,
            enum: [
                "Cultural",
                "Beach",
                "Wildlife",
                "Adventure",
                "Honeymoon",
                "Family",
                "Luxury",
                "Budget",
                "Round Tour",
                "Other",
            ],
            default: "Other",
        },

        overview: {
            type: String,
            required: [
                true,
                "Package overview is required",
            ],
            trim: true,
        },

        highlights: [
            {
                type: String,
                trim: true,
            },
        ],

        destinations: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Destination",
            },
        ],

        startLocation: {
            type: String,
            trim: true,
            default: "",
        },

        endLocation: {
            type: String,
            trim: true,
            default: "",
        },

        pickupAvailable: {
            type: Boolean,
            default: false,
        },

        pickupDetails: {
            type: String,
            trim: true,
            default: "",
        },

        startTime: {
            type: String,
            trim: true,
            default: "",
        },

        returnTime: {
            type: String,
            trim: true,
            default: "",
        },

        priceFrom: {
            type: Number,
            required: [
                true,
                "Starting price is required",
            ],
            min: 0,
        },

        currency: {
            type: String,
            enum: [
                "USD",
                "LKR",
                "EUR",
                "GBP",
            ],
            default: "USD",
        },

        pricingBasis: {
            type: String,
            enum: [
                "Starting Price",
                "Per Person",
                "Per Group",
                "Custom Quote",
            ],
            default: "Starting Price",
        },

        minTravelers: {
            type: Number,
            min: 1,
            default: 1,
        },

        maxTravelers: {
            type: Number,
            min: 1,
            default: null,
        },

        inclusions: [
            {
                type: String,
                trim: true,
            },
        ],

        exclusions: [
            {
                type: String,
                trim: true,
            },
        ],

        itinerary: [
            itineraryDaySchema,
        ],

        imageUrl: {
            type: String,
            trim: true,
            default: "",
        },

        isFeatured: {
            type: Boolean,
            default: false,
        },

        status: {
            type: String,
            enum: [
                "Active",
                "Inactive",
            ],
            default: "Active",
        },
    },
    {
        timestamps: true,
    }
);

tourPackageSchema.index({
    tourType: 1,
    status: 1,
    isFeatured: 1,
});

const TourPackage = mongoose.model(
    "TourPackage",
    tourPackageSchema
);

module.exports = TourPackage;