const mongoose = require("mongoose");
const { itineraryFitsTrip } = require("../utils/bookingItinerary");

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

const itineraryDaySchema = new mongoose.Schema({
    date: { type: Date, required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    plan: { type: String, trim: true, maxlength: 800, default: "" },
    overnightLocation: { type: String, trim: true, maxlength: 120, default: "" },
    createdAt: { type: Date, default: Date.now },
});

const paymentContactSchema = new mongoose.Schema({
    lastContactedAt: { type: Date, required: true },
    lastContactedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
    channel: { type: String, enum: ["WhatsApp", "Phone", "Email", "Other"], required: true },
    nextFollowUpDate: { type: Date, default: null },
}, { _id: false });

const supplierContactSchema = new mongoose.Schema({
    contactedAt: { type: Date, required: true },
    contactedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
    contactedByName: { type: String, trim: true, maxlength: 120, default: "" },
    channel: { type: String, enum: ["Email", "WhatsApp", "Phone", "Other"], required: true },
    note: { type: String, trim: true, maxlength: 300, default: "" },
    nextFollowUpDate: { type: Date, default: null },
});

const roomingPlanSchema = new mongoose.Schema({
    assignments: { type: [String], required: true },
    rosterVersion: { type: Number, required: true, min: 0 },
    roomCount: { type: Number, required: true, min: 1, max: 20 },
    savedAt: { type: Date, required: true },
    savedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    savedByName: { type: String, trim: true, maxlength: 120, default: "" },
}, { _id: false });

const recoveryEventSchema = new mongoose.Schema({
    action: { type: String, enum: ["plan", "contact", "resolve", "reopen"], required: true },
    at: { type: Date, required: true },
    byName: { type: String, trim: true, maxlength: 120, default: "" },
    channel: { type: String, enum: ["WhatsApp", "Email", "Phone", "Other"], default: null },
    note: { type: String, trim: true, maxlength: 500, required: true },
    nextFollowUpDate: { type: Date, default: null },
}, { _id: false });

const recoverySchema = new mongoose.Schema({
    status: { type: String, enum: ["Open", "Resolved"], required: true },
    nextFollowUpDate: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    events: { type: [recoveryEventSchema], default: [] },
}, { _id: false });

const tripIssueEventSchema = new mongoose.Schema({
    action: { type: String, enum: ["opened", "updated", "resolved", "reopened"], required: true },
    note: { type: String, required: true, trim: true, maxlength: 500 },
    at: { type: Date, required: true },
    byName: { type: String, trim: true, maxlength: 120, default: "" },
    nextFollowUpDate: { type: Date, default: null },
}, { _id: false });

const tripIssueSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, enum: ["Accommodation", "Transport", "Guide", "Itinerary", "Health & Safety", "Other"], required: true },
    priority: { type: String, enum: ["Urgent", "Normal"], required: true },
    status: { type: String, enum: ["Open", "Resolved"], default: "Open" },
    nextFollowUpDate: { type: Date, default: null },
    openedAt: { type: Date, required: true },
    resolvedAt: { type: Date, default: null },
    revision: { type: Number, default: 0, min: 0 },
    events: { type: [tripIssueEventSchema], default: [] },
});

const postTripCareSchema = new mongoose.Schema({
    status: { type: String, enum: ["Contacted", "Feedback received", "Declined"], required: true },
    contactCount: { type: Number, min: 0, default: 0 },
    lastContactedAt: { type: Date, default: null },
    lastContactChannel: { type: String, enum: ["WhatsApp", "Email", "Phone", "Other"], default: null },
    contactNote: { type: String, trim: true, maxlength: 500, default: "" },
    feedbackAt: { type: Date, default: null },
    feedbackRating: { type: Number, min: 1, max: 5, default: null },
    feedbackNote: { type: String, trim: true, maxlength: 500, default: "" },
    recovery: { type: recoverySchema, default: null },
    updatedAt: { type: Date, required: true },
    updatedByName: { type: String, trim: true, maxlength: 120, default: "" },
}, { _id: false });

const hotelStaySchema = new mongoose.Schema({
    hotelName: { type: String, required: true, trim: true, maxlength: 120 },
    location: { type: String, trim: true, maxlength: 120, default: "" },
    supplierEmail: { type: String, trim: true, lowercase: true, maxlength: 254, default: "" },
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
    contacts: { type: [supplierContactSchema], default: [] },
    confirmationNumber: { type: String, trim: true, maxlength: 100, default: "" },
    roomingPlan: { type: roomingPlanSchema, default: null },
    roomingRevision: { type: Number, min: 0, default: 0 },
    cancellationDeadline: { type: Date, default: null },
    cancellationTerms: { type: String, trim: true, maxlength: 300, default: "" },
    notes: { type: String, trim: true, maxlength: 500, default: "" },
    createdAt: { type: Date, default: Date.now },
});

const transferFlightSchema = new mongoose.Schema({
    direction: { type: String, enum: ["Arrival", "Departure"], required: true },
    number: { type: String, trim: true, uppercase: true, maxlength: 20, required: true },
    date: { type: Date, required: true },
    time: { type: String, default: "", match: /^(?:|(?:[01]\d|2[0-3]):[0-5]\d)$/ },
    airport: { type: String, trim: true, maxlength: 120, default: "" },
    terminal: { type: String, trim: true, maxlength: 60, default: "" },
}, { _id: false });

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
    flight: { type: transferFlightSchema, default: null },
    status: { type: String, enum: ["Requested", "Confirmed", "Cancelled"], default: "Requested" },
    followUpDate: { type: Date, default: null },
    contacts: { type: [supplierContactSchema], default: [] },
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

        travelerNames: {
            type: [{ type: String, trim: true, maxlength: 120 }],
            default: [],
            validate: [
                { validator: (names) => names.length <= 60, message: "A booking can have at most 60 named travelers" },
                { validator: function (names) {
                    return !(this instanceof mongoose.Document) || names.length <= this.numberOfTravelers;
                }, message: "Named travelers cannot exceed the booking traveler count" },
            ],
        },
        travelerRosterVersion: { type: Number, default: 0, min: 0 },

        postTripCare: { type: postTripCareSchema, default: null },
        postTripCareRevision: { type: Number, default: 0, min: 0 },
        tripIssues: { type: [tripIssueSchema], default: [],
            validate: { validator: (issues) => issues.length <= 30, message: "A booking can have at most 30 trip issues" } },

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

        hotelAdvanceAmount: {
            type: Number,
            default: 0,
            min: 0,
            validate: {
                validator: function (value) {
                    return (!(this instanceof mongoose.Document) || value <= this.totalPrice + 0.000001) &&
                        Math.abs(value * 100 - Math.round(value * 100)) < 0.000001;
                },
                message: "Hotel advance must be no greater than the total price and use at most two decimals",
            },
        },

        hotelAdvanceDueDate: {
            type: Date,
            default: null,
        },

        paymentDueDate: {
            type: Date,
            default: null,
        },

        paymentContact: {
            type: paymentContactSchema,
            default: null,
        },

        paymentStatus: {
            type: String,
            enum: ["Pending", "Partially Paid", "Paid", "Refunded"],
            default: "Pending",
        },

        // Internal lease for serializing payment writes across API instances.
        paymentWriteToken: { type: String, default: null, select: false },
        paymentWriteExpiresAt: { type: Date, default: null, select: false },

        bookingStatus: {
            type: String,
            enum: ["Pending", "Confirmed", "In Progress", "Completed", "Cancelled"],
            default: "Pending",
        },

        cancellationReason: { type: String, trim: true, maxlength: 300, default: "" },
        cancelledAt: { type: Date, default: null },
        cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
        cancelledByName: { type: String, trim: true, maxlength: 120, default: "" },

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

        itineraryDays: {
            type: [itineraryDaySchema],
            default: [],
            validate: [
                { validator: (days) => days.length <= 60, message: "A booking can have at most 60 itinerary entries" },
                { validator: function (days) {
                    // $push validators run without a booking document. The itinerary routes
                    // check trip dates against the loaded booking and match them atomically.
                    return !(this instanceof mongoose.Document) ||
                        itineraryFitsTrip(days, this.travelStartDate, this.travelEndDate);
                }, message: "Itinerary dates must stay within booking travel dates" },
            ],
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
bookingSchema.index({ inquiry: 1 });
bookingSchema.index({ bookingStatus: 1, updatedAt: -1 });
bookingSchema.index({ bookingStatus: 1, travelEndDate: -1 });

const Booking = mongoose.model("Booking", bookingSchema);

module.exports = Booking;
