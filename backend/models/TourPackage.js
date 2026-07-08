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
        },
    },
    { _id: false }
);

const tourPackageSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, "Package title is required"],
            trim: true,
            unique: true,
        },

        durationDays: {
            type: Number,
            required: [true, "Duration is required"],
            min: 1,
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
            required: [true, "Package overview is required"],
        },

        destinations: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Destination",
            },
        ],

        priceFrom: {
            type: Number,
            required: [true, "Starting price is required"],
            min: 0,
        },

        currency: {
            type: String,
            enum: ["USD", "LKR", "EUR", "GBP"],
            default: "USD",
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

        itinerary: [itineraryDaySchema],

        imageUrl: {
            type: String,
            default: "",
        },

        isFeatured: {
            type: Boolean,
            default: false,
        },

        status: {
            type: String,
            enum: ["Active", "Inactive"],
            default: "Active",
        },
    },
    {
        timestamps: true,
    }
);

const TourPackage = mongoose.model("TourPackage", tourPackageSchema);

module.exports = TourPackage;