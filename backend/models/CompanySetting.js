const mongoose = require("mongoose");

const socialLinkSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            trim: true,
            default: "",
        },

        url: {
            type: String,
            trim: true,
            default: "",
        },
    },
    {
        _id: false,
    }
);

const vehicleRatesSchema = new mongoose.Schema(
    {
        car: {
            type: Number,
            default: 80,
        },

        suv: {
            type: Number,
            default: 95,
        },

        van: {
            type: Number,
            default: 110,
        },

        miniBus: {
            type: Number,
            default: 0,
        },

        bus: {
            type: Number,
            default: 0,
        },
    },
    {
        _id: false,
    }
);

const pdfSettingsSchema = new mongoose.Schema(
    {
        showWatermark: {
            type: Boolean,
            default: true,
        },

        watermarkOpacity: {
            type: Number,
            default: 0.06,
        },

        footerText: {
            type: String,
            trim: true,
            default: "Thank you for choosing Dream Ceylon Journeys.",
        },

        paymentInstructions: {
            type: String,
            default:
                "Payment can be made by bank transfer, cash, or another agreed method. Please mention the booking or quotation number when making payments.",
        },

        termsAndConditions: {
            type: String,
            default:
                "This document is generated for customer reference. Prices, availability, and itinerary details may change based on final confirmation.",
        },
    },
    {
        _id: false,
    }
);

const companySettingSchema = new mongoose.Schema(
    {
        singletonKey: {
            type: String,
            default: "company-profile",
            unique: true,
            index: true,
        },

        companyName: {
            type: String,
            trim: true,
            default: "Dream Ceylon Journeys",
        },

        tagline: {
            type: String,
            trim: true,
            default: "Sri Lanka Private Tours & Tailor-Made Holidays",
        },

        address: {
            type: String,
            trim: true,
            default: "Sri Lanka",
        },

        mobiles: {
            type: [String],
            default: ["+94 77 512 4645"],
        },

        whatsapp: {
            type: String,
            trim: true,
            default: "+94775124645",
        },

        email: {
            type: String,
            trim: true,
            default: "info@dreamceylonjourneys.com",
        },

        website: {
            type: String,
            trim: true,
            default: "https://www.dreamceylonjourneys.com",
        },

        socialLinks: {
            type: [socialLinkSchema],
            default: [
                {
                    name: "Facebook",
                    url: "https://www.facebook.com/",
                },
                {
                    name: "Instagram",
                    url: "https://www.instagram.com/",
                },
                {
                    name: "TikTok",
                    url: "https://www.tiktok.com/",
                },
                {
                    name: "LinkedIn",
                    url: "https://www.linkedin.com/",
                },
            ],
        },

        defaultCurrency: {
            type: String,
            enum: ["USD", "LKR", "EUR", "GBP"],
            default: "USD",
        },

        vehicleRates: {
            type: vehicleRatesSchema,
            default: () => ({
                car: 80,
                suv: 95,
                van: 110,
                miniBus: 0,
                bus: 0,
            }),
        },

        pdfSettings: {
            type: pdfSettingsSchema,
            default: () => ({
                showWatermark: true,
                watermarkOpacity: 0.06,
                footerText: "Thank you for choosing Dream Ceylon Journeys.",
                paymentInstructions:
                    "Payment can be made by bank transfer, cash, or another agreed method. Please mention the booking or quotation number when making payments.",
                termsAndConditions:
                    "This document is generated for customer reference. Prices, availability, and itinerary details may change based on final confirmation.",
            }),
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

module.exports = mongoose.model("CompanySetting", companySettingSchema);