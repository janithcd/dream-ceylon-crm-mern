const notFound = (req, res) => {
    return res.status(404).json({
        message: `Route not found: ${req.method} ${req.originalUrl}`,
    });
};

const errorHandler = (error, req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }

    const isProduction = process.env.NODE_ENV === "production";

    let statusCode =
        Number(error.statusCode) ||
        Number(error.status) ||
        500;

    if (error.name === "ValidationError") {
        statusCode = 400;
    }

    if (error.name === "CastError") {
        statusCode = 400;
    }

    if (error.code === 11000) {
        statusCode = 409;
    }

    const response = {
        message:
            statusCode === 500 && isProduction
                ? "An unexpected server error occurred."
                : error.message || "Server error",
    };

    if (!isProduction) {
        response.stack = error.stack;
        response.path = req.originalUrl;
        response.method = req.method;
    }

    console.error(
        `[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`,
        error
    );

    return res.status(statusCode).json(response);
};

module.exports = {
    notFound,
    errorHandler,
};
