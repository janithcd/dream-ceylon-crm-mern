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

const preparationTaskSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120,
    },
    completedAt: {
        type: Date,
        default: null,
    },
    completedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Admin",
        default: null,
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Admin",
        default: null,
    },
    dueDate: {
        type: Date,
        default: null,
    },
    priority: {
        type: String,
        enum: ["High", "Normal", "Low"],
        default: "Normal",
    },
    notes: {
        type: String,
        trim: true,
        maxlength: 500,
        default: "",
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

const hotelStaySchema = new mongoose.Schema({
    hotelName: { type: String, required: true, trim: true, maxlength: 120 },
    location: { type: String, trim: true, maxlength: 120, default: "" },
    checkInDate: { type: Date, required: true },
    checkOutDate: { type: Date, required: true },
    rooms: { type: Number, min: 1, max: 20, default: 1 },
    roomType: { type: String, trim: true, maxlength: 100, default: "" },
    mealPlan: {
        type: String,
        enum: ["Room Only", "Bed & Breakfast", "Half Board", "Full Board", "All Inclusive", "Other"],
        default: "Room Only",
    },
    status: { type: String, enum: ["Requested", "Confirmed", "Cancelled"], default: "Requested" },
    followUpDate: { type: Date, default: null },
    confirmationNumber: { type: String, trim: true, maxlength: 100, default: "" },
    notes: { type: String, trim: true, maxlength: 500, default: "" },
    createdAt: { type: Date, default: Date.now },
});

const transportAssignmentSchema = new mongoose.Schema({
    route: { type: String, required: true, trim: true, maxlength: 120 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    pickupTime: { type: String, trim: true, default: "" },
    pickupLocation: { type: String, trim: true, maxlength: 120, default: "" },
    dropoffLocation: { type: String, trim: true, maxlength: 120, default: "" },
    vehicleDescription: { type: String, trim: true, maxlength: 100, default: "" },
    registration: { type: String, trim: true, maxlength: 24, default: "" },
    registrationKey: { type: String, trim: true, default: "" },
    chauffeurName: { type: String, trim: true, maxlength: 100, default: "" },
    chauffeurPhone: { type: String, trim: true, maxlength: 32, default: "" },
    status: { type: String, enum: ["Requested", "Confirmed", "Cancelled"], default: "Requested" },
    followUpDate: { type: Date, default: null },
    notes: { type: String, trim: true, maxlength: 500, default: "" },
    createdAt: { type: Date, default: Date.now },
});

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

        paymentDueDate: {
            type: Date,
            default: null,
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

        preparationTasks: {
            type: [preparationTaskSchema],
            default: [],
        },

        hotelStays: {
            type: [hotelStaySchema],
            default: [],
        },

        transportAssignments: {
            type: [transportAssignmentSchema],
            default: [],
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

bookingSchema.index({ "preparationTasks.assignedTo": 1, bookingStatus: 1 });
bookingSchema.index({ bookingStatus: 1, "preparationTasks.completedAt": 1 });
bookingSchema.index({ "transportAssignments.registrationKey": 1, "transportAssignments.startDate": 1, "transportAssignments.endDate": 1 });

const Booking = mongoose.model("Booking", bookingSchema);

module.exports = Booking;
