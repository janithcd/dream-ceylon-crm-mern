const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
    {
        fullName: {
            type: String,
            required: [true, "Customer name is required"],
            trim: true,
        },

        email: {
            type: String,
            required: [true, "Customer email is required"],
            lowercase: true,
            trim: true,
        },

        whatsappNumber: {
            type: String,
            required: [true, "WhatsApp number is required"],
            trim: true,
        },

        country: {
            type: String,
            required: [true, "Country is required"],
            trim: true,
        },
    },
    { _id: false }
);

const bookingSchema = new mongoose.Schema(
    {
        bookingCode: {
            type: String,
            unique: true,
            trim: true,
        },

        inquiry: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Inquiry",
            default: null,
        },

        customer: {
            type: customerSchema,
            required: true,
        },

        selectedPackage: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "TourPackage",
            default: null,
        },

        travelStartDate: {
            type: Date,
            required: [true, "Travel start date is required"],
        },

        travelEndDate: {
            type: Date,
            required: [true, "Travel end date is required"],
        },

        numberOfTravelers: {
            type: Number,
            required: [true, "Number of travelers is required"],
            min: 1,
        },

        vehicleType: {
            type: String,
            enum: ["Car", "SUV", "Van", "Mini Bus", "Other"],
            default: "Car",
        },

        totalPrice: {
            type: Number,
            required: [true, "Total price is required"],
            min: 0,
        },

        currency: {
            type: String,
            enum: ["USD", "LKR", "EUR", "GBP"],
            default: "USD",
        },

        advancePayment: {
            type: Number,
            default: 0,
            min: 0,
        },

        paymentStatus: {
            type: String,
            enum: ["Pending", "Partially Paid", "Paid", "Refunded"],
            default: "Pending",
        },

        bookingStatus: {
            type: String,
            enum: ["Pending", "Confirmed", "In Progress", "Completed", "Cancelled"],
            default: "Pending",
        },

        specialRequests: {
            type: String,
            default: "",
        },

        adminNotes: {
            type: String,
            default: "",
        },
    },
    {
        timestamps: true,
    }
);

// Auto-generate booking code before saving
bookingSchema.pre("save", function () {
    if (!this.bookingCode) {
        const year = new Date().getFullYear();
        const randomNumber = Math.floor(100000 + Math.random() * 900000);
        this.bookingCode = `DCJ-${year}-${randomNumber}`;
    }
});

const Booking = mongoose.model("Booking", bookingSchema);

module.exports = Booking;