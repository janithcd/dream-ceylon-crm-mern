const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const BookingPayment = require("../models/BookingPayment");
const CostEntry = require("../models/CostEntry");

const main = async () => {
    if (process.env.CI_SMOKE_TESTS !== "true") throw new Error("This smoke test must be explicitly enabled in CI");
    await mongoose.connect(process.env.MONGO_URI);
    const admins = [];
    const bookings = [];
    try {
        for (const role of ["Sales", "Finance", "Manager"]) {
            admins.push(await Admin.create({ name: `CI Cancel ${role}`,
                email: `ci-cancel-${role}-${Date.now()}@example.invalid`,
                password: "disposable-ci-only-password", role }));
        }
        const [sales, finance, manager] = admins;
        const request = (admin, query = "") => fetch(`http://127.0.0.1:5000/api/bookings/cancellation-review${query}`, {
            headers: { Authorization: `Bearer ${jwt.sign({ id: admin._id, v: 0 }, process.env.JWT_SECRET)}` },
        });
        const makeBooking = async (code, bookingStatus, hotelStatus) => {
            const booking = await Booking.create({ bookingCode: code,
                customer: { fullName: "CI Cancellation Guest", email: "cancel@example.invalid",
                    whatsappNumber: "+94771234567", country: "UK" },
                travelStartDate: new Date("2027-04-01"), travelEndDate: new Date("2027-04-05"),
                numberOfTravelers: 2, totalPrice: 600, advancePayment: 200, currency: "USD",
                bookingStatus, hotelStays: [{ hotelName: "CI Hotel", checkInDate: new Date("2027-04-01"),
                    checkOutDate: new Date("2027-04-02"), status: hotelStatus }],
                transportAssignments: [{ route: "CI Airport", startDate: new Date("2027-04-01"),
                    endDate: new Date("2027-04-01"), status: "Cancelled" }],
            });
            bookings.push(booking);
            return booking;
        };
        const code = `CI-CANCEL-${Date.now()}`;
        const open = await makeBooking(`${code}-OPEN`, "Cancelled", "Confirmed");
        const settled = await makeBooking(`${code}-SETTLED`, "Cancelled", "Cancelled");
        await makeBooking(`${code}-ACTIVE`, "Confirmed", "Requested");
        await BookingPayment.create({ paymentNo: `${code}-R`, booking: open._id,
            amount: 200, currency: "USD", status: "Received", paymentType: "Advance" });
        await BookingPayment.create({ paymentNo: `${code}-F`, booking: open._id,
            amount: 50, currency: "USD", status: "Refunded", paymentType: "Refund" });
        await BookingPayment.create({ paymentNo: `${code}-X`, booking: open._id,
            amount: 40, currency: "USD", status: "Cancelled", paymentType: "Advance" });
        await CostEntry.create({ recordType: "Booking", recordId: open._id, category: "Hotel",
            description: "CI Hotel charge", amount: 120, paidAmount: 40, currency: "LKR",
            conversionRate: 0.003, targetCurrency: "USD", createdBy: finance._id });
        const salesResponse = await request(sales, "?filter=open");
        assert.equal(salesResponse.status, 200);
        const salesData = await salesResponse.json();
        const salesItem = salesData.items.find((item) => item._id === String(open._id));
        assert.equal(salesItem?.activeServiceCount, 1);
        assert.deepEqual(salesItem?.activeHotels.map(({ name }) => name), ["CI Hotel"]);
        assert.deepEqual(salesItem?.activeTransport, []);
        assert.equal(salesItem?.bookedPaidAmount, undefined);
        assert.equal(salesItem?.supplierCosts, undefined);
        assert.equal(salesData.items.some((item) => item._id === String(settled._id)), false);
        assert.equal((await request(manager, "?filter=open")).status, 200);
        const financeResponse = await request(finance, "?filter=all");
        assert.equal(financeResponse.status, 200, await financeResponse.clone().text());
        const financeData = await financeResponse.json();
        const financeItem = financeData.items.find((item) => item._id === String(open._id));
        assert.equal(financeItem?.bookedPaidAmount, 200);
        assert.deepEqual(financeItem?.supplierCosts.map(({ currency, recordedUnpaid }) => [currency, recordedUnpaid]), [["LKR", 80]]);
        assert.deepEqual(financeItem?.guestLedger.map(({ status, amount }) => [status, amount]).sort(),
            [["Received", 200], ["Refunded", 50]].sort());
        assert.ok(financeData.items.some((item) => item._id === String(settled._id)));
        assert.equal(financeData.items.some((item) => item.bookingCode === `${code}-ACTIVE`), false);
        console.log("Cancellation review filters live arrangements and protects finance snapshots.");
    } finally {
        const ids = bookings.map((booking) => booking._id);
        if (ids.length) {
            await BookingPayment.deleteMany({ booking: { $in: ids } });
            await CostEntry.deleteMany({ recordType: "Booking", recordId: { $in: ids } });
            await Booking.deleteMany({ _id: { $in: ids } });
        }
        if (admins.length) await Admin.deleteMany({ _id: { $in: admins.map((admin) => admin._id) } });
        await mongoose.disconnect();
    }
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
