const CompanySetting = require("../models/CompanySetting");

const safeText = (value) => {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
};

const toNumber = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
};

const normalizeStringArray = (value) => {
    if (Array.isArray(value)) {
        return value.map((item) => safeText(item)).filter(Boolean);
    }

    if (typeof value === "string") {
        return value
            .split(/\n|,/)
            .map((item) => safeText(item))
            .filter(Boolean);
    }

    return [];
};

const normalizeSocialLinks = (value) => {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item) => ({
            name: safeText(item.name),
            url: safeText(item.url),
        }))
        .filter((item) => item.name || item.url);
};

const getDefaultSettingsPayload = () => {
    return {
        singletonKey: "company-profile",
        companyName: "Dream Ceylon Journeys",
        tagline: "Sri Lanka Private Tours & Tailor-Made Holidays",
        address: "Sri Lanka",
        mobiles: ["+94 77 512 4645"],
        whatsapp: "+94775124645",
        email: "info@dreamceylonjourneys.com",
        website: "https://www.dreamceylonjourneys.com",
        socialLinks: [
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
        defaultCurrency: "USD",
        vehicleRates: {
            car: 80,
            suv: 95,
            van: 110,
            miniBus: 0,
            bus: 0,
        },
        pdfSettings: {
            showWatermark: true,
            watermarkOpacity: 0.06,
            footerText: "Thank you for choosing Dream Ceylon Journeys.",
            paymentInstructions:
                "Payment can be made by bank transfer, cash, or another agreed method. Please mention the booking or quotation number when making payments.",
            termsAndConditions:
                "This document is generated for customer reference. Prices, availability, and itinerary details may change based on final confirmation.",
        },
        status: "Active",
    };
};

const getOrCreateSettings = async () => {
    let settings = await CompanySetting.findOne({
        singletonKey: "company-profile",
    });

    if (!settings) {
        settings = await CompanySetting.create(getDefaultSettingsPayload());
    }

    return settings;
};

// @desc    Get company settings
// @route   GET /api/settings/company
// @access  Private
const getCompanySettings = async (req, res) => {
    try {
        const settings = await getOrCreateSettings();

        res.status(200).json(settings);
    } catch (error) {
        res.status(500).json({
            message: "Failed to load company settings",
            error: error.message,
        });
    }
};

// @desc    Update company settings
// @route   PUT /api/settings/company
// @access  Private
const updateCompanySettings = async (req, res) => {
    try {
        const settings = await getOrCreateSettings();

        const {
            companyName,
            tagline,
            address,
            mobiles,
            whatsapp,
            email,
            website,
            socialLinks,
            defaultCurrency,
            vehicleRates,
            pdfSettings,
            status,
        } = req.body;

        if (companyName !== undefined) {
            settings.companyName = safeText(companyName);
        }

        if (tagline !== undefined) {
            settings.tagline = safeText(tagline);
        }

        if (address !== undefined) {
            settings.address = safeText(address);
        }

        if (mobiles !== undefined) {
            settings.mobiles = normalizeStringArray(mobiles);
        }

        if (whatsapp !== undefined) {
            settings.whatsapp = safeText(whatsapp);
        }

        if (email !== undefined) {
            settings.email = safeText(email);
        }

        if (website !== undefined) {
            settings.website = safeText(website);
        }

        if (socialLinks !== undefined) {
            settings.socialLinks = normalizeSocialLinks(socialLinks);
        }

        if (defaultCurrency !== undefined) {
            settings.defaultCurrency = defaultCurrency;
        }

        if (vehicleRates) {
            settings.vehicleRates = {
                car: toNumber(vehicleRates.car, settings.vehicleRates?.car || 80),
                suv: toNumber(vehicleRates.suv, settings.vehicleRates?.suv || 95),
                van: toNumber(vehicleRates.van, settings.vehicleRates?.van || 110),
                miniBus: toNumber(
                    vehicleRates.miniBus,
                    settings.vehicleRates?.miniBus || 0
                ),
                bus: toNumber(vehicleRates.bus, settings.vehicleRates?.bus || 0),
            };
        }

        if (pdfSettings) {
            settings.pdfSettings = {
                showWatermark:
                    pdfSettings.showWatermark !== undefined
                        ? Boolean(pdfSettings.showWatermark)
                        : settings.pdfSettings?.showWatermark ?? true,

                watermarkOpacity: toNumber(
                    pdfSettings.watermarkOpacity,
                    settings.pdfSettings?.watermarkOpacity || 0.06
                ),

                footerText:
                    pdfSettings.footerText !== undefined
                        ? safeText(pdfSettings.footerText)
                        : settings.pdfSettings?.footerText || "",

                paymentInstructions:
                    pdfSettings.paymentInstructions !== undefined
                        ? safeText(pdfSettings.paymentInstructions)
                        : settings.pdfSettings?.paymentInstructions || "",

                termsAndConditions:
                    pdfSettings.termsAndConditions !== undefined
                        ? safeText(pdfSettings.termsAndConditions)
                        : settings.pdfSettings?.termsAndConditions || "",
            };
        }

        if (status !== undefined) {
            settings.status = status;
        }

        await settings.save();

        res.status(200).json({
            message: "Company settings updated successfully",
            settings,
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to update company settings",
            error: error.message,
        });
    }
};

// @desc    Reset company settings to default
// @route   POST /api/settings/company/reset
// @access  Private
const resetCompanySettings = async (req, res) => {
    try {
        await CompanySetting.findOneAndUpdate(
            {
                singletonKey: "company-profile",
            },
            getDefaultSettingsPayload(),
            {
                returnDocument: "after",
                upsert: true,
                runValidators: true,
            }
        );

        const settings = await getOrCreateSettings();

        res.status(200).json({
            message: "Company settings reset successfully",
            settings,
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to reset company settings",
            error: error.message,
        });
    }
};

module.exports = {
    getCompanySettings,
    updateCompanySettings,
    resetCompanySettings,
};