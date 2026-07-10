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


dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Test route
app.get("/", (req, res) => {
  res.send("Dream Ceylon CRM API is running...");
});

// API routes
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

// Server port
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});