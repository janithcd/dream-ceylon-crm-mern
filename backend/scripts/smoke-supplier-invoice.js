const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const CostEntry = require("../models/CostEntry");
const SupplierInvoice = require("../models/SupplierInvoice");
const ActivityLog = require("../models/ActivityLog");
const { getBusinessDayBounds } = require("../utils/businessDate");

const main = async () => {
    if (process.env.CI_SMOKE_TESTS !== "true") throw new Error("Enable disposable CI smoke tests explicitly.");
    await mongoose.connect(process.env.MONGO_URI);
    let admin, booking, cost;
    try {
        admin = await Admin.create({ name: "CI Invoice Reviewer", email: `ci-invoice-${Date.now()}@example.invalid`,
            password: "disposable-ci-only-password", role: "Finance" });
        booking = await Booking.create({ bookingCode: `CI-INVOICE-${Date.now()}`, bookingStatus: "Confirmed",
            customer: { fullName: "CI Guest", email: "private@example.invalid", whatsappNumber: "+94771234567", country: "UK" },
            travelStartDate: new Date("2027-03-10"), travelEndDate: new Date("2027-03-11"), numberOfTravelers: 2, totalPrice: 1000 });
        cost = await CostEntry.create({ recordType: "Booking", recordId: booking._id, category: "Hotel",
            description: "CI Beach House", amount: 125, currency: "USD", conversionRate: 1, targetCurrency: "USD",
            paidAmount: 0, createdBy: admin._id });
        const base = `/api/finance/costs/${cost._id}`;
        const request = (path, { method = "GET", body, raw, headers = {}, proxy = false } = {}) =>
            fetch(`${proxy ? "http://frontend:8080" : "http://127.0.0.1:5000"}${base}${path}`, {
                method, headers: { Authorization: `Bearer ${jwt.sign({ id: admin._id, v: 0 }, process.env.JWT_SECRET)}`,
                    "Content-Type": raw ? "application/pdf" : "application/json", ...headers },
                body: raw || (body === undefined ? undefined : JSON.stringify(body)),
            });
        const details = { supplierName: "CI Beach House", invoiceReference: "CI-PRO-FORMA-101",
            invoiceDate: "2026-10-16", dueDate: "2027-03-09", amount: 130, currency: "USD" };
        const created = await request("/invoices", { method: "POST", body: details });
        assert.equal(created.status, 201, await created.clone().text());
        const invoice = (await created.json()).invoice;
        assert.equal((await request("/invoices", { method: "POST", body: details })).status, 409);
        const token = jwt.sign({ id: admin._id, v: 0 }, process.env.JWT_SECRET);
        const register = (query = "") => fetch(`http://127.0.0.1:5000/api/finance/costs/invoice-register${query}`,
            { headers: { Authorization: `Bearer ${token}` } });
        const yesterday = new Date(getBusinessDayBounds().start.getTime() + 330 * 60 * 1000 - 24 * 60 * 60 * 1000)
            .toISOString().slice(0, 10);
        const overdueRecord = await request("/invoices", { method: "POST", body: { ...details,
            invoiceReference: "CI-PRO-FORMA-OVERDUE", invoiceDate: yesterday, dueDate: yesterday } });
        assert.equal(overdueRecord.status, 201, await overdueRecord.clone().text());
        const pending = await (await register()).json();
        assert.equal(pending.summary.needsReview, 2);
        assert.equal(pending.summary.overdue, 1);
        assert.equal((await (await register("?due=overdue")).json()).total, 1);
        assert.equal((await (await register("?due=due7")).json()).total, 1);
        assert.equal((await (await register("?due=later")).json()).total, 1);
        assert.equal((await register("?status=voided&due=overdue")).status, 400);
        assert.doesNotMatch(JSON.stringify(pending), /sha256|reviewHistory|CI PRIVATE SUPPLIER INVOICE/);
        const pdf = Buffer.from("%PDF-1.7\nCI PRIVATE SUPPLIER INVOICE\n%%EOF\n");
        const filePath = `/invoices/${invoice._id}/file`;
        const upload = await request(`${filePath}?expectedVersion=${invoice.__v}`, { method: "POST", raw: pdf,
            headers: { "X-File-Name": encodeURIComponent("CI Pro Forma.pdf") }, proxy: true });
        assert.equal(upload.status, 201, await upload.clone().text());
        const attached = (await upload.json()).invoice;
        assert.equal((await SupplierInvoice.findById(invoice._id)).data, undefined);
        const downloaded = await request(filePath, { proxy: true });
        assert.equal(downloaded.status, 200);
        assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), pdf);
        assert.equal((await request(`/invoices/${invoice._id}/review`, { method: "PATCH", body: {
            status: "Approved", expectedVersion: attached.__v, confirmed: true,
        } })).status, 400);
        const approved = await request(`/invoices/${invoice._id}/review`, { method: "PATCH", body: {
            status: "Approved", expectedVersion: attached.__v, confirmed: true, confirmedDifference: true,
        } });
        assert.equal(approved.status, 200, await approved.clone().text());
        assert.equal((await approved.json()).invoice.reviewHistory.length, 1);
        assert.equal((await (await register("?status=Approved")).json()).total, 1);
        const paymentDay = new Date(getBusinessDayBounds().start.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
        cost.paymentHistory.push({ kind: "payment", amount: 50, paidAmountAfter: 50, paymentDate: new Date(paymentDay),
            method: "Bank transfer", reference: "CI-BANK-INVOICE-50", recordedBy: admin._id, recordedByName: admin.name });
        cost.paidAmount = 50;
        await cost.save();
        const voucherPath = `/payments/${cost.paymentHistory[0]._id}/remittance`;
        const preview = await request(voucherPath);
        assert.equal(preview.status, 200, await preview.clone().text());
        const voucherDetails = await preview.json();
        assert.equal(voucherDetails.approvedInvoices.length, 1);
        assert.equal(String(voucherDetails.approvedInvoices[0]._id), String(invoice._id));
        const savedVoucher = await request(voucherPath, { method: "PUT", body: {
            supplierName: details.supplierName, invoiceReference: details.invoiceReference,
            sourceInvoiceId: String(invoice._id), sourceInvoiceVersion: voucherDetails.approvedInvoices[0].__v,
            transferAmount: 50, transferCurrency: "USD", transferReference: "CI-BANK-INVOICE-50",
            expectedVersion: voucherDetails.version, confirmed: true,
        } });
        assert.equal(savedVoucher.status, 201, await savedVoucher.clone().text());
        assert.equal((await savedVoucher.json()).current.sourceInvoiceId, String(invoice._id));
        assert.equal((await CostEntry.findById(cost._id)).paidAmount, 50);
        assert.equal((await request("", { method: "DELETE" })).status, 409);
        const list = await request("/invoices");
        assert.equal(list.status, 200);
        const result = await list.json();
        assert.equal(result.items.find((item) => String(item._id) === String(invoice._id)).status, "Approved");
        assert.doesNotMatch(JSON.stringify(result), /sha256|"data"|CI PRIVATE SUPPLIER INVOICE/);
        const current = result.items.find((item) => String(item._id) === String(invoice._id));
        const voided = await request(`/invoices/${invoice._id}/void`, { method: "PATCH", body: {
            expectedVersion: current.__v, reason: "Corrected supplier invoice received",
        } });
        assert.equal(voided.status, 200, await voided.clone().text());
        assert.equal((await request(filePath)).status, 410);
        const afterVoid = await (await request(voucherPath)).json();
        assert.equal(afterVoid.approvedInvoices.length, 0);
        assert.equal(afterVoid.current.sourceInvoiceId, String(invoice._id));
        assert.equal((await (await register("?status=voided")).json()).total, 1);
        assert.equal((await request("/invoices", { method: "POST", body: details })).status, 201);
        console.log("Supplier invoice upload, approval, voucher source, register filters and history verified without altering the payment total.");
    } finally {
        if (cost) { await SupplierInvoice.deleteMany({ cost: cost._id }); await CostEntry.deleteOne({ _id: cost._id }); }
        if (booking) { await ActivityLog.deleteMany({ relatedRecordId: booking._id }); await Booking.deleteOne({ _id: booking._id }); }
        if (admin) await Admin.deleteOne({ _id: admin._id });
        await mongoose.disconnect();
    }
};
main().catch((error) => { console.error(error); process.exitCode = 1; });
