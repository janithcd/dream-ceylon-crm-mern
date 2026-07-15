const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

const databaseState = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
};

router.get("/", (req, res) => {
    const dbState =
        databaseState[mongoose.connection.readyState] || "unknown";

    const healthy = dbState === "connected";

    return res.status(healthy ? 200 : 503).json({
        status: healthy ? "ok" : "degraded",
        service: process.env.APP_NAME || "Dream Ceylon CRM API",
        version: process.env.APP_VERSION || "1.0.0",
        environment: process.env.NODE_ENV || "development",
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
        database: dbState,
    });
});

module.exports = router;
