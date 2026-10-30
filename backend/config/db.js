const mongoose = require("mongoose");
const BookingPayment = require("../models/BookingPayment");

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        // Finish the unique receipt index before accepting payment writes.
        await BookingPayment.createIndexes();

        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`MongoDB Connection Error: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;
