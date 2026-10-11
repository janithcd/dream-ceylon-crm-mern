require("dotenv").config();
const app = require("./app");
const connectDB = require("./config/db");
const mongoose = require("mongoose");
const { validateEnvironment } = require("./config/validateEnv");

const PORT = Number(process.env.PORT) || 5000;

let server;

const startServer = async () => {
  try {
    validateEnvironment();

    await connectDB();

    server = app.listen(PORT, () => {
      console.log(
          `Dream Ceylon CRM API running on port ${PORT}`
      );

      console.log(
          `Environment: ${
              process.env.NODE_ENV || "development"
          }`
      );

      console.log(
          `Health check: http://localhost:${PORT}/api/health`
      );
    });
  } catch (error) {
    console.error(
        "Server startup failed:",
        error.message
    );

    process.exit(1);
  }
};

const shutdown = (signal) => {
  console.log(
      `${signal} received. Shutting down safely...`
  );

  if (!server) {
    process.exit(0);
    return;
  }

  server.close(async () => {
    try {
      await mongoose.disconnect();
      console.log("HTTP server and database connections closed.");
      process.exit(0);
    } catch (error) {
      console.error("Database shutdown failed:", error.message);
      process.exit(1);
    }
  });

  setTimeout(() => {
    console.error(
        "Forced shutdown after timeout."
    );

    process.exit(1);
  }, 10000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (error) => {
  console.error(
      "Unhandled promise rejection:",
      error
  );

  if (server) {
    server.close(() => process.exit(1));
  } else {
    process.exit(1);
  }
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  process.exit(1);
});

startServer();

module.exports = app;