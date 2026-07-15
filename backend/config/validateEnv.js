const REQUIRED_VARIABLES = [
    "MONGO_URI",
    "JWT_SECRET",
];

const isBlank = (value) =>
    value === undefined ||
    value === null ||
    String(value).trim() === "";

const validateEnvironment = () => {
    const missing = REQUIRED_VARIABLES.filter((name) =>
        isBlank(process.env[name])
    );

    if (missing.length > 0) {
        throw new Error(
            `Missing required environment variables: ${missing.join(", ")}`
        );
    }

    if (
        process.env.NODE_ENV === "production" &&
        String(process.env.JWT_SECRET).length < 32
    ) {
        throw new Error(
            "JWT_SECRET must contain at least 32 characters in production."
        );
    }

    if (!process.env.OPENAI_API_KEY) {
        console.warn(
            "OPENAI_API_KEY is missing. AI features may be unavailable."
        );
    }

    if (
        process.env.NODE_ENV === "production" &&
        !process.env.CLIENT_URLS &&
        !process.env.CLIENT_URL
    ) {
        throw new Error(
            "CLIENT_URLS or CLIENT_URL must be configured in production."
        );
    }
};

module.exports = {
    validateEnvironment,
};
