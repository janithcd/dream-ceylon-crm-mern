const path = require("path");

const rootPath = path.join(__dirname, "..");

const brandConfig = {
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

    logoPath: path.join(rootPath, "assets", "brand", "logo.png"),

    vehicleImages: {
        Car: path.join(rootPath, "assets", "vehicles", "car.png"),
        SUV: path.join(rootPath, "assets", "vehicles", "suv.png"),
        Van: path.join(rootPath, "assets", "vehicles", "van.png"),
        "Mini Bus": path.join(rootPath, "assets", "vehicles", "mini-bus.png"),
        default: path.join(rootPath, "assets", "vehicles", "default-vehicle.png"),
    },
};

module.exports = brandConfig;