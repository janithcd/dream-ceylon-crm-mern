const mongoose = require("mongoose");

const vehicleSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Vehicle name is required"],
            trim: true,
            unique: true,
        },

        type: {
            type: String,
            enum: ["Car", "SUV", "Van", "Mini Bus", "Bus", "Other"],
            required: [true, "Vehicle type is required"],
        },

        capacity: {
            type: Number,
            required: [true, "Passenger capacity is required"],
            min: 1,
        },

        pricePerDay: {
            type: Number,
            required: [true, "Price per day is required"],
            min: 0,
        },

        currency: {
            type: String,
            enum: ["USD", "LKR", "EUR", "GBP"],
            default: "USD",
        },

        imageUrl: {
            type: String,
            default: "",
        },

        description: {
            type: String,
            required: [true, "Description is required"],
            trim: true,
        },

        features: [
            {
                type: String,
                trim: true,
            },
        ],

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

const Vehicle = mongoose.model("Vehicle", vehicleSchema);

module.exports = Vehicle;