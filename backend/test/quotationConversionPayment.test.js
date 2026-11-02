const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Quotation = require("../models/Quotation");
const Booking = require("../models/Booking");
const Inquiry = require("../models/Inquiry");
const ActivityLog = require("../models/ActivityLog");
const { convertQuotationToBooking } = require("../controllers/quotationConversionController");

test("converting a quotation keeps the requested advance out of recorded payments", async (t) => {
    const id = () => new mongoose.Types.ObjectId();
    const quotation = { _id: id(), quotationNo: "Q-CI-1", status: "Sent", booking: null,
        inquiry: { _id: id(), fullName: "Example Guest", email: "guest@example.invalid", whatsappNumber: "+94771234567",
            country: "UK", numberOfTravelers: 2 },
        clientName: "Example Guest", country: "UK", travelers: 2,
        travelStartDate: new Date("2027-02-27"), travelEndDate: new Date("2027-03-13"),
        currency: "USD", vehicleType: "Car", totals: { grandTotal: 1200, advancePayment: 600, balancePayment: 600 },
        notes: "Hotel meal plans and weather guidance for the guest", adminNotes: "PRIVATE INVOICE NOTE",
        async save() { return this; } };
    let created, inquiryUpdate, logs = [];
    const thenable = (value) => ({ populate() { return this; }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });
    t.mock.method(Quotation, "findById", () => thenable(quotation));
    t.mock.method(Booking, "exists", async () => false);
    t.mock.method(Booking, "create", async (payload) => { created = payload; return { _id: id(), ...payload }; });
    t.mock.method(Booking, "findById", () => thenable({ _id: id(), ...created }));
    t.mock.method(Inquiry, "findByIdAndUpdate", async (inquiryId, change) => { inquiryUpdate = { inquiryId, change }; });
    t.mock.method(ActivityLog, "create", async (entry) => { logs.push(entry); return entry; });

    const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; },
        json(value) { this.body = value; return this; } });
    const res = response();
    await convertQuotationToBooking({ params: { id: quotation._id.toString() },
        body: { confirmAccepted: true, email: "guest@example.invalid", whatsappNumber: "+94771234567",
            bookingStatus: "Confirmed", advancePayment: 600, paymentStatus: "Paid",
            adminNotes: `Booking created from quotation ${quotation.quotationNo}.` } }, res);
    assert.equal(res.statusCode, 201, JSON.stringify(res.body));
    assert.equal(created.totalPrice, 1200);
    assert.equal(created.advancePayment, 0);
    assert.equal(created.paymentStatus, "Pending");
    assert.equal(created.bookingStatus, "Confirmed");
    assert.equal(created.specialRequests, "");
    assert.equal(res.body.booking.advancePayment, 0);
    assert.equal(res.body.booking.paymentStatus, "Pending");
    assert.equal(quotation.status, "Accepted");
    assert.ok(quotation.booking);
    assert.equal(inquiryUpdate.change.status, "Converted");
    assert.equal(logs.length, 2);
    assert.ok(logs.every((log) => log.metadata.paymentStatus === "Pending"));
    assert.ok(!JSON.stringify(created).includes(quotation.notes));

    const again = response();
    await convertQuotationToBooking({ params: { id: quotation._id.toString() }, body: { confirmAccepted: true } }, again);
    assert.equal(again.statusCode, 400);
    assert.match(again.body.message, /already been converted/);

    for (const vehicleType of ["Bus", "Private Vehicle"]) {
        const result = new Booking({ bookingCode: `CI-${vehicleType.replace(" ", "-")}`,
            customer: { fullName: "Example Guest", email: "guest@example.invalid", whatsappNumber: "+94771234567", country: "UK" },
            travelStartDate: new Date("2027-02-27"), travelEndDate: new Date("2027-03-13"),
            numberOfTravelers: 2, totalPrice: 1200, vehicleType });
        await assert.doesNotReject(result.validate(), `${vehicleType} must be a valid vehicle when a quotation converts`);
    }
});
