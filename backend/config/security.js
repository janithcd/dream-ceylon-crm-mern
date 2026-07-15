const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const numberFromEnv = (name, fallback) => {
    const value = Number(process.env[name]);

    return Number.isFinite(value) && value > 0
        ? value
        : fallback;
};

const getAllowedOrigins = () => {
    const rawOrigins =
        process.env.CLIENT_URLS ||
        process.env.CLIENT_URL ||
        "http://localhost:5173";

    return rawOrigins
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);
};

const corsOptions = {
    origin(origin, callback) {
        const allowedOrigins = getAllowedOrigins();

        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        return callback(
            new Error(`CORS blocked request from origin: ${origin}`)
        );
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Requested-With",
    ],
    exposedHeaders: [
        "Content-Disposition",
        "Content-Length",
    ],
    optionsSuccessStatus: 204,
};

const globalLimiter = rateLimit({
    windowMs: numberFromEnv("RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
    max: numberFromEnv("RATE_LIMIT_MAX", 1000),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message:
            "Too many requests were sent from this address. Please try again later.",
    },
    skip: (req) => req.path === "/api/health",
});

const authLimiter = rateLimit({
    windowMs: numberFromEnv("RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
    max: numberFromEnv("AUTH_RATE_LIMIT_MAX", 10),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message:
            "Too many login attempts. Please wait before trying again.",
    },
});

const publicInquiryLimiter = rateLimit({
    windowMs: numberFromEnv("RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
    max: numberFromEnv("PUBLIC_INQUIRY_RATE_LIMIT_MAX", 5),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message:
            "Too many inquiry submissions. Please wait and try again.",
    },
});

const applySecurityMiddleware = (app) => {
    app.disable("x-powered-by");

    if (process.env.NODE_ENV === "production") {
        app.set("trust proxy", 1);
    }

    app.use(
        helmet({
            crossOriginResourcePolicy: {
                policy: "cross-origin",
            },
        })
    );

    app.use(cors(corsOptions));
    app.use(globalLimiter);
};

module.exports = {
    applySecurityMiddleware,
    authLimiter,
    publicInquiryLimiter,
    corsOptions,
};
