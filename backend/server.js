const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const connectDB = require("./config/db");


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


dotenv.config();


connectDB();

const app = express();


app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Dream Ceylon CRM API is running...");
});


app.use("/api/auth", authRoutes);
app.use("/api/destinations", destinationRoutes);
app.use("/api/packages", packageRoutes);
app.use("/api/inquiries", inquiryRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/pdf", pdfRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/quotations", quotationRoutes);
app.use("/api/booking-pdf", bookingPdfRoutes);
app.use("/api/booking-payments", bookingPaymentRoutes);
app.use("/api/payment-receipts", paymentReceiptPdfRoutes);
app.use("/api/follow-ups", followUpRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/finance", financeReportRoutes);
app.use("/api/settings", settingRoutes);
app.use("/api/activity-logs", activityLogRoutes);


const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});