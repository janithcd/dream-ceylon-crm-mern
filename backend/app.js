const express = require("express");

const {
  applySecurityMiddleware,
} = require("./config/security");

const {
  notFound,
  errorHandler,
} = require("./middleware/errorMiddleware");

// Route imports
const healthRoutes = require("./routes/healthRoutes");
const authRoutes = require("./routes/authRoutes");
const destinationRoutes = require("./routes/destinationRoutes");
const packageRoutes = require("./routes/packageRoutes");
const inquiryRoutes = require("./routes/inquiryRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const vehicleRoutes = require("./routes/vehicleRoutes");
const aiRoutes = require("./routes/aiRoutes");
const pdfRoutes = require("./routes/pdfRoutes");
const publicRoutes = require("./routes/publicRoutes");
const quotationRoutes = require("./routes/quotationRoutes");
const bookingPdfRoutes = require("./routes/bookingPdfRoutes");
const bookingPaymentRoutes = require("./routes/bookingPaymentRoutes");
const paymentReceiptPdfRoutes = require("./routes/paymentReceiptPdfRoutes");
const followUpRoutes = require("./routes/followUpRoutes");
const customerRoutes = require("./routes/customerRoutes");
const financeReportRoutes = require("./routes/financeReportRoutes");
const settingRoutes = require("./routes/settingRoutes");
const activityLogRoutes = require("./routes/activityLogRoutes");
const adminManagementRoutes = require("./routes/adminManagementRoutes");
const tripadvisorRoutes = require(
    "./routes/tripadvisorRoutes"
);
const path = require("path");
const chatConversationRoutes =
    require(
        "./routes/chatConversationRoutes"
    );

const publicChatRoutes =
    require(
        "./routes/publicChatRoutes"
    );

const app = express();


applySecurityMiddleware(app);


app.use(
    express.json({
      limit: "2mb",
    })
);

app.use(
    express.urlencoded({
      extended: true,
      limit: "2mb",
    })
);
app.use(
    "/uploads",
    express.static(
        path.join(
            __dirname,
            "uploads"
        )
    )
);

app.get("/", (req, res) => {
  return res.status(200).json({
    message: "Dream Ceylon CRM API is running.",
    health: "/api/health",
    environment: process.env.NODE_ENV || "development",
  });
});

/*
 * Health check
 */
app.use("/api/health", healthRoutes);

/*
 * Authentication and administration
 */
app.use("/api/auth", authRoutes);
app.use("/api/admins", adminManagementRoutes);
app.use("/api/activity-logs", activityLogRoutes);

app.use("/api/destinations", destinationRoutes);
app.use("/api/packages", packageRoutes);
app.use("/api/inquiries", inquiryRoutes);

app.use(
    "/api/chat-conversations",
    chatConversationRoutes
);


app.use("/api/bookings", bookingRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/vehicles", vehicleRoutes);


app.use("/api/quotations", quotationRoutes);
app.use("/api/booking-pdf", bookingPdfRoutes);
app.use("/api/booking-payments", bookingPaymentRoutes);
app.use("/api/payment-receipts", paymentReceiptPdfRoutes);


app.use("/api/follow-ups", followUpRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/finance", financeReportRoutes);
app.use("/api/settings", settingRoutes);


app.use("/api/ai", aiRoutes);
app.use("/api/pdf", pdfRoutes);


app.use(
    "/api/public/tripadvisor-reviews",
    tripadvisorRoutes
);
app.use(
    "/api/public/travel-assistant",
    publicChatRoutes
);
app.use("/api/public", publicRoutes);


app.use(notFound);
app.use(errorHandler);


module.exports = app;
