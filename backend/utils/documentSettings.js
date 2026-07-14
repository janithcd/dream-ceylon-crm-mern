const defaultBrandConfig = require("../config/brandConfig");
const CompanySetting = require("../models/CompanySetting");

const getDocumentBrandConfig = async () => {
    try {
        const settings = await CompanySetting.findOne({
            singletonKey: "company-profile",
            status: "Active",
        });

        if (!settings) {
            return {
                ...defaultBrandConfig,
                defaultCurrency: "USD",
                vehicleRates: {
                    Car: 80,
                    SUV: 95,
                    Van: 110,
                    "Mini Bus": 0,
                    Bus: 0,
                },
                pdfSettings: {
                    showWatermark: true,
                    watermarkOpacity: 0.06,
                    footerText: "Thank you for choosing Dream Ceylon Journeys.",
                    paymentInstructions:
                        "Payment can be made by bank transfer, cash, or another agreed method.",
                    termsAndConditions:
                        "Prices and availability may change until the booking is confirmed.",
                },
            };
        }

        return {
            ...defaultBrandConfig,

            companyName: settings.companyName || defaultBrandConfig.companyName,
            tagline: settings.tagline || defaultBrandConfig.tagline,
            address: settings.address || defaultBrandConfig.address,

            mobiles:
                settings.mobiles && settings.mobiles.length > 0
                    ? settings.mobiles
                    : defaultBrandConfig.mobiles,

            whatsapp: settings.whatsapp || defaultBrandConfig.whatsapp,
            email: settings.email || defaultBrandConfig.email,
            website: settings.website || defaultBrandConfig.website,

            socialLinks:
                settings.socialLinks && settings.socialLinks.length > 0
                    ? settings.socialLinks
                    : defaultBrandConfig.socialLinks,

            defaultCurrency: settings.defaultCurrency || "USD",

            vehicleRates: {
                Car: settings.vehicleRates?.car ?? 80,
                SUV: settings.vehicleRates?.suv ?? 95,
                Van: settings.vehicleRates?.van ?? 110,
                "Mini Bus": settings.vehicleRates?.miniBus ?? 0,
                Bus: settings.vehicleRates?.bus ?? 0,
            },

            pdfSettings: {
                showWatermark: settings.pdfSettings?.showWatermark ?? true,
                watermarkOpacity: settings.pdfSettings?.watermarkOpacity ?? 0.06,
                footerText:
                    settings.pdfSettings?.footerText ||
                    "Thank you for choosing Dream Ceylon Journeys.",
                paymentInstructions:
                    settings.pdfSettings?.paymentInstructions ||
                    "Payment can be made by bank transfer, cash, or another agreed method.",
                termsAndConditions:
                    settings.pdfSettings?.termsAndConditions ||
                    "Prices and availability may change until the booking is confirmed.",
            },
        };
    } catch (error) {
        console.error("Failed to load document settings:", error.message);

        return {
            ...defaultBrandConfig,
            defaultCurrency: "USD",
            vehicleRates: {
                Car: 80,
                SUV: 95,
                Van: 110,
                "Mini Bus": 0,
                Bus: 0,
            },
            pdfSettings: {
                showWatermark: true,
                watermarkOpacity: 0.06,
                footerText: "Thank you for choosing Dream Ceylon Journeys.",
                paymentInstructions:
                    "Payment can be made by bank transfer, cash, or another agreed method.",
                termsAndConditions:
                    "Prices and availability may change until the booking is confirmed.",
            },
        };
    }
};

module.exports = {
    getDocumentBrandConfig,
};