const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const CostEntry = require("../models/CostEntry");
const ActivityLog = require("../models/ActivityLog");
const { getBusinessDayBounds } = require("../utils/businessDate");

const main = async () => {
    if (process.env.CI_SMOKE_TESTS !== "true") throw new Error("Enable disposable CI smoke tests explicitly.");
    await mongoose.connect(process.env.MONGO_URI);
    let admin, booking, cost;
    try {
        admin = await Admin.create({ name: "CI Supplier Paid Total", email: `ci-paid-total-${Date.now()}@example.invalid`,
            password: "disposable-ci-only-password", role: "Finance" });
        booking = await Booking.create({ bookingCode: `CI-PAID-TOTAL-${Date.now()}`, bookingStatus: "Confirmed",
            customer: { fullName: "CI Guest", email: "guest@example.invalid", whatsappNumber: "+94771234567", country: "UK" },
            travelStartDate: new Date("2027-03-10"), travelEndDate: new Date("2027-03-11"), numberOfTravelers: 2, totalPrice: 1000 });
        cost = await CostEntry.create({ recordType: "Booking", recordId: booking._id, category: "Hotel", description: "CI Laluna Hotel",
            amount: 16000, currency: "LKR", conversionRate: 0.003, targetCurrency: "USD", paidAmount: 16000,
            createdBy: admin._id, paymentHistory: [{ kind: "adjustment", amount: 16000, paidAmountAfter: 16000,
                recordedBy: admin._id, recordedByName: admin.name, note: "Earlier paid total" }] });
        const token = jwt.sign({ id: admin._id, v: 0 }, process.env.JWT_SECRET);
        const request = (path, method = "GET", body) => fetch(`http://127.0.0.1:5000/api/finance/costs${path}`, {
            method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const paymentDay = new Date(getBusinessDayBounds().start.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
        const path = `/${cost._id}/payments`;
        const details = { amount: 16000, paymentDate: paymentDay, method: "Bank transfer", reference: "CI-LALUNA-BANK-123",
            expectedVersion: cost.__v, confirmed: true };
        assert.equal((await request(`${path}/from-paid-total`, "POST", { ...details, confirmed: false })).status, 400);
        const response = await request(`${path}/from-paid-total`, "POST", details);
        assert.equal(response.status, 201, await response.clone().text());
        const saved = await response.json();
        assert.equal(saved.paidAmount, 16000);
        assert.equal(saved.payment.allocatedFromPaidTotal, true);
        assert.equal((await request(`${path}/from-paid-total`, "POST", details)).status, 409);
        const current = await CostEntry.findById(cost._id);
        assert.equal(current.paidAmount, 16000);
        assert.equal(current.paymentHistory.length, 2);

        const register = await request(`/payment-register?from=${paymentDay}&to=${paymentDay}`);
        assert.equal(register.status, 200);
        assert.ok((await register.json()).items.some((item) => item.paymentId === String(saved.payment._id) &&
            item.allocatedFromPaidTotal && item.amount === 16000));
        const voucherPath = `${path}/${saved.payment._id}/remittance`;
        const preview = await request(voucherPath);
        assert.equal(preview.status, 200, await preview.clone().text());
        const version = (await preview.json()).version;
        const voucher = await request(voucherPath, "PUT", { supplierName: "CI Laluna Hotel", invoiceReference: "CI-PRO-FORMA-123",
            transferAmount: 16000, transferCurrency: "LKR", transferReference: details.reference,
            expectedVersion: version, confirmed: true });
        assert.equal(voucher.status, 201, await voucher.clone().text());
        const pdf = await request(`${voucherPath}/pdf`, "POST", { revision: 1 });
        assert.equal(pdf.status, 200, await pdf.clone().text());
        assert.match(pdf.headers.get("content-type"), /application\/pdf/);
        assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), "%PDF");
        assert.equal((await CostEntry.findById(cost._id)).paidAmount, 16000);
        console.log("Existing supplier paid total documented once; register and voucher PDF verified without changing balance.");
    } finally {
        if (cost) await CostEntry.deleteOne({ _id: cost._id });
        if (booking) {
            await ActivityLog.deleteMany({ relatedRecordId: booking._id });
            await Booking.deleteOne({ _id: booking._id });
        }
        if (admin) await Admin.deleteOne({ _id: admin._id });
        await mongoose.disconnect();
    }
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
