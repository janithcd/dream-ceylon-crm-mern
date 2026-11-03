const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const Supplier = require("../models/Supplier");
const SupplierRate = require("../models/SupplierRate");
const ActivityLog = require("../models/ActivityLog");
const { getBusinessDayBounds } = require("../utils/businessDate");

const main = async () => {
    if (process.env.CI_SMOKE_TESTS !== "true") throw new Error("Enable disposable CI smoke tests explicitly.");
    await mongoose.connect(process.env.MONGO_URI);
    let admin, supplier, rate;
    try {
        admin = await Admin.create({ name: "CI Rate Manager", email: `ci-rates-${Date.now()}@example.invalid`,
            password: "disposable-ci-only-password", role: "Finance" });
        const suffix = Date.now();
        supplier = await Supplier.create({ category: "Hotel", name: `CI Rate Hotel ${suffix}`, nameKey: `ci rate hotel ${suffix}`,
            location: "Bentota", locationKey: "bentota", createdBy: admin._id, updatedBy: admin._id });
        const token = jwt.sign({ id: admin._id, v: 0 }, process.env.JWT_SECRET);
        const request = (path, method = "GET", body) => fetch(`http://127.0.0.1:5000/api/suppliers/${supplier._id}/rates${path}`, {
            method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const today = new Date(getBusinessDayBounds().start.getTime() + 330 * 60 * 1000);
        const from = today.toISOString().slice(0, 10);
        const to = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const data = { service: "Superior sea view", unit: "Room per night", mealPlan: "Bed & Breakfast", occupancy: 2,
            amount: 130, currency: "USD", validFrom: from, validTo: to, sourceReference: "CI Supplier email", notes: "Taxes included", status: "Active" };
        const created = await request("", "POST", data);
        assert.equal(created.status, 201, await created.clone().text());
        rate = await created.json();
        assert.equal((await request("", "POST", { ...data, validFrom: to })).status, 409);
        const current = await request("?timing=Current&status=Active");
        assert.equal(current.status, 200);
        assert.ok((await current.json()).items.some((item) => String(item._id) === String(rate._id)));
        const revised = await request(`/${rate._id}`, "PUT", { ...data, amount: 125, expectedVersion: rate.__v });
        assert.equal(revised.status, 200, await revised.clone().text());
        const second = await revised.json();
        assert.equal(second.history[0].amount, 130);
        assert.equal((await request(`/${rate._id}`, "PUT", { ...data, amount: 120, expectedVersion: rate.__v })).status, 409);
        const archived = await request(`/${rate._id}`, "PUT", { ...data, amount: 125, status: "Inactive", expectedVersion: second.__v });
        assert.equal(archived.status, 200, await archived.clone().text());
        const active = await (await request("?timing=Current&status=Active")).json();
        assert.ok(!active.items.some((item) => String(item._id) === String(rate._id)));
        console.log("Supplier rate validity, overlap guard, revision history and inactive filter verified.");
    } finally {
        if (rate) await SupplierRate.deleteOne({ _id: rate._id });
        if (supplier) { await ActivityLog.deleteMany({ relatedRecordId: supplier._id }); await Supplier.deleteOne({ _id: supplier._id }); }
        if (admin) await Admin.deleteOne({ _id: admin._id });
        await mongoose.disconnect();
    }
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
