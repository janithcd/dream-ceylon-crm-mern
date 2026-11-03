const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const Supplier = require("../models/Supplier");
const ActivityLog = require("../models/ActivityLog");

const main = async () => {
    if (process.env.CI_SMOKE_TESTS !== "true") throw new Error("Enable disposable CI smoke tests explicitly.");
    await mongoose.connect(process.env.MONGO_URI);
    await Supplier.init();
    let admin, supplier;
    try {
        admin = await Admin.create({ name: "CI Supplier Directory", email: `ci-supplier-${Date.now()}@example.invalid`,
            password: "disposable-ci-only-password", role: "Finance" });
        const token = jwt.sign({ id: admin._id, v: 0 }, process.env.JWT_SECRET);
        const request = (path, method = "GET", body) => fetch(`http://127.0.0.1:5000/api/suppliers${path}`, {
            method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const record = { category: "Hotel", name: `CI Laluna ${Date.now()}`, location: "Bentota", email: "reservations@example.invalid",
            contactName: "CI Hotel Contact", phone: "+94 77 123 4567", whatsapp: "", terms: "Advance required",
            notes: "Internal only", status: "Active" };
        const created = await request("", "POST", record);
        assert.equal(created.status, 201, await created.clone().text());
        supplier = await created.json();
        assert.equal((await request("", "POST", { ...record, name: record.name.toUpperCase(), location: " bentota " })).status, 409);
        const list = await request(`?category=Hotel&status=Active&keyword=${encodeURIComponent(record.name)}&limit=50`);
        assert.equal(list.status, 200);
        assert.ok((await list.json()).items.some((item) => String(item._id) === String(supplier._id) && item.email === record.email));
        const archived = await request(`/${supplier._id}`, "PUT", { ...record, status: "Inactive", expectedVersion: supplier.__v });
        assert.equal(archived.status, 200, await archived.clone().text());
        const active = await (await request(`?category=Hotel&status=Active&keyword=${encodeURIComponent(record.name)}`)).json();
        assert.ok(!active.items.some((item) => String(item._id) === String(supplier._id)));
        console.log("Supplier directory create, duplicate protection, hotel lookup and deactivation passed.");
    } finally {
        if (supplier) { await ActivityLog.deleteMany({ relatedRecordId: supplier._id }); await Supplier.deleteOne({ _id: supplier._id }); }
        if (admin) await Admin.deleteOne({ _id: admin._id });
        await mongoose.disconnect();
    }
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
