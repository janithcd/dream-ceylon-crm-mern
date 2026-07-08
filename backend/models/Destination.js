const mongoose = require("mongoose");

const destinationSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Destination name is required"],
            trim: true,
            unique: true,
        },

        province: {
            type: String,
            required: [true, "Province is required"],
            trim: true,
        },

        category: {
            type: String,
            enum: [
                "Cultural",
                "Beach",
                "Wildlife",
                "Hill Country",
                "Adventure",
                "City",
                "Religious",
                "Other",
            ],
            default: "Other",
        },

        shortDescription: {
            type: String,
            required: [true, "Short description is required"],
            maxlength: 200,
        },

        description: {
            type: String,
            required: [true, "Description is required"],
        },

        imageUrl: {
            type: String,
            default: "",
        },

        bestFor: {
            type: String,
            default: "",
        },

        isPopular: {
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

const Destination = mongoose.model("Destination", destinationSchema);

module.exports = Destination;