const mongoose = require("mongoose");

const quotationSchema = new mongoose.Schema(
    {
        quotationNo: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },

        inquiry: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Inquiry",
            default: null,
        },

        booking: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Booking",
            default: null,
        },

        clientName: {
            type: String,
            required: true,
            trim: true,
        },

        country: {
            type: String,
            trim: true,
            default: "",
        },

        tourTitle: {
            type: String,
            required: true,
            trim: true,
        },

        travelStartDate: {
            type: Date,
            default: null,
        },

        travelEndDate: {
            type: Date,
            default: null,
        },

        travelers: {
            type: Number,
            default: 0,
            min: 0,
        },

        durationDays: {
            type: Number,
            default: 0,
            min: 0,
        },

        vehicleType: {
            type: String,
            enum: ["Car", "SUV", "Van", "Mini Bus", "Bus", "Other", "Private Vehicle"],
            default: "Private Vehicle",
        },

        vehicleDailyRate: {
            type: Number,
            default: 0,
            min: 0,
        },

        vehicleDays: {
            type: Number,
            default: 0,
            min: 0,
        },

        hotelCost: {
            type: Number,
            default: 0,
            min: 0,
        },

        activitiesCost: {
            type: Number,
            default: 0,
            min: 0,
        },

        entranceFeesCost: {
            type: Number,
            default: 0,
            min: 0,
        },

        otherCost: {
            type: Number,
            default: 0,
            min: 0,
        },

        discount: {
            type: Number,
            default: 0,
            min: 0,
        },

        advancePayment: {
            type: Number,
            default: 0,
            min: 0,
        },

        currency: {
            type: String,
            enum: ["USD", "LKR", "EUR", "GBP"],
            default: "USD",
        },

        totals: {
            vehicleTotal: {
                type: Number,
                default: 0,
            },
            hotelTotal: {
                type: Number,
                default: 0,
            },
            activitiesTotal: {
                type: Number,
                default: 0,
            },
            entranceFeesTotal: {
                type: Number,
                default: 0,
            },
            otherTotal: {
                type: Number,
                default: 0,
            },
            subtotal: {
                type: Number,
                default: 0,
            },
            discount: {
                type: Number,
                default: 0,
            },
            grandTotal: {
                type: Number,
                default: 0,
            },
            advancePayment: {
                type: Number,
                default: 0,
            },
            balancePayment: {
                type: Number,
                default: 0,
            },
        },

        inclusions: {
            type: [String],
            default: [],
        },

        exclusions: {
            type: [String],
            default: [],
        },

        notes: {
            type: String,
            default: "",
        },

        status: {
            type: String,
            enum: ["Draft", "Sent", "Accepted", "Rejected", "Expired"],
            default: "Draft",
        },

        sentDate: {
            type: Date,
            default: null,
        },

        acceptedDate: {
            type: Date,
            default: null,
        },

        adminNotes: {
            type: String,
            default: "",
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("Quotation", quotationSchema);