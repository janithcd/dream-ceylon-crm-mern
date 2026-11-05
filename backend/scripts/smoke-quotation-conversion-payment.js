const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const Quotation = require("../models/Quotation");
const Booking = require("../models/Booking");
const BookingPayment = require("../models/BookingPayment");
const CostEntry = require("../models/CostEntry");
const ActivityLog = require("../models/ActivityLog");

const main = async () => {
    if (process.env.CI_SMOKE_TESTS !== "true") throw new Error("This smoke test must be explicitly enabled in CI");
    await mongoose.connect(process.env.MONGO_URI);
    let admin, finance, quotation, bookingId, estimate, bookingCost;
    const marker = `CI-CONVERSION-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
        admin = await Admin.create({ name: "CI Quotation Conversion", email: `ci-quotation-conversion-${Date.now()}@example.invalid`,
            password: "disposable-ci-only-password", role: "Sales" });
        finance = await Admin.create({ name: "CI Cost Reviewer", email: `ci-cost-reviewer-${Date.now()}@example.invalid`,
            password: "disposable-ci-only-password", role: "Finance" });
        quotation = await Quotation.create({ quotationNo: `CI-QUOTE-${Date.now()}`, clientName: "CI Guest", country: "UK",
            tourTitle: "CI Conversion", travelStartDate: new Date("2027-02-27"), travelEndDate: new Date("2027-03-13"),
            travelers: 2, vehicleType: "Bus", currency: "USD", status: "Sent", advancePayment: 600,
            totals: { grandTotal: 1200, advancePayment: 600, balancePayment: 600 },
            notes: "PRIVATE QUOTATION CONDITIONS" });
        estimate = await CostEntry.create({ recordType: "Quotation", recordId: quotation._id, category: "Hotel",
            description: "CI Beach House estimate", amount: 120, currency: "USD", conversionRate: 1,
            targetCurrency: "USD", createdBy: finance._id });
        const request = (body) => fetch(`http://127.0.0.1:5000/api/quotations/${quotation._id}/convert-to-booking`, {
            method: "POST", headers: { Authorization: `Bearer ${jwt.sign({ id: admin._id, v: 0 }, process.env.JWT_SECRET)}`,
                "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        const converted = await request({ confirmAccepted: true, email: "guest@example.invalid", whatsappNumber: "+94771234567",
            advancePayment: 1200, paymentStatus: "Paid", adminNotes: marker });
        assert.equal(converted.status, 201, await converted.clone().text());
        const result = await converted.json();
        bookingId = result.booking._id;
        const booking = await Booking.findById(bookingId);
        assert.equal(booking.totalPrice, 1200);
        assert.equal(booking.advancePayment, 0);
        assert.equal(booking.paymentStatus, "Pending");
        assert.equal(booking.vehicleType, "Bus");
        assert.equal(booking.specialRequests, "");
        assert.equal(booking.bookingStatus, "Confirmed");
        assert.equal(await BookingPayment.countDocuments({ booking: bookingId }), 0);
        const updatedQuote = await Quotation.findById(quotation._id);
        assert.equal(updatedQuote.status, "Accepted");
        assert.equal(String(updatedQuote.booking), String(bookingId));
        assert.equal(updatedQuote.totals.advancePayment, 600);
        assert.equal(updatedQuote.notes, "PRIVATE QUOTATION CONDITIONS");
        const costUrl = `http://127.0.0.1:5000/api/finance/costs/booking/${bookingId}`;
        const reviewed = { estimateId: estimate._id, estimateVersion: estimate.__v, confirmedEstimate: true,
            category: "Hotel", description: "CI Beach House confirmed", amount: 130, currency: "USD",
            conversionRate: 1, paymentDueDate: "2027-02-26", paidAmount: 0 };
        const importCost = (body) => fetch(costUrl, { method: "POST", headers: {
            Authorization: `Bearer ${jwt.sign({ id: finance._id, v: 0 }, process.env.JWT_SECRET)}`,
            "Content-Type": "application/json",
        }, body: JSON.stringify(body) });
        assert.equal((await importCost({ ...reviewed, confirmedEstimate: false })).status, 400);
        const imported = await importCost(reviewed);
        assert.equal(imported.status, 201, await imported.clone().text());
        bookingCost = await imported.json();
        assert.equal(bookingCost.estimateSource.amount, 120);
        assert.equal(bookingCost.amount, 130);
        assert.equal(bookingCost.paidAmount, 0);
        assert.equal((await importCost(reviewed)).status, 409);
        const costs = await fetch(costUrl, { headers: { Authorization: `Bearer ${jwt.sign({ id: finance._id, v: 0 }, process.env.JWT_SECRET)}` } });
        assert.equal(costs.status, 200);
        assert.equal((await costs.json()).linkedEstimate.items[0].bookingCostId, bookingCost._id);
        assert.equal((await request({ confirmAccepted: true, email: "guest@example.invalid" })).status, 400);
        console.log("Quotation conversion preserves terms; reviewed estimate handoff creates one unpaid booking cost with original source.");
    } finally {
        if (bookingCost) await CostEntry.deleteOne({ _id: bookingCost._id });
        if (estimate) await CostEntry.deleteOne({ _id: estimate._id });
        if (!bookingId) bookingId = (await Booking.findOne({ adminNotes: marker }).select("_id"))?._id;
        if (bookingId) {
            await BookingPayment.deleteMany({ booking: bookingId });
            await ActivityLog.deleteMany({ relatedRecordId: bookingId });
            await Booking.deleteOne({ _id: bookingId });
        }
        if (quotation) {
            await ActivityLog.deleteMany({ relatedRecordId: quotation._id });
            await Quotation.deleteOne({ _id: quotation._id });
        }
        if (admin) await Admin.deleteOne({ _id: admin._id });
        if (finance) await Admin.deleteOne({ _id: finance._id });
        await mongoose.disconnect();
    }
};
main().catch((error) => { console.error(error); process.exitCode = 1; });
