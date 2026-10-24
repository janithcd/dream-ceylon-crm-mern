const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const Inquiry = require("../models/Inquiry");
const Booking = require("../models/Booking");
const ActivityLog = require("../models/ActivityLog");

const main = async () => {
    if (process.env.CI_SMOKE_TESTS !== "true") throw new Error("Enable disposable CI smoke tests explicitly.");
    await mongoose.connect(process.env.MONGO_URI);
    const ids = [];
    let booking;
    let sales;
    let finance;

    try {
        sales = await Admin.create({ name: "CI Lead Sales", email: `ci-leads-${Date.now()}@example.invalid`, password: "disposable-ci-only-password", role: "Sales" });
        finance = await Admin.create({ name: "CI Lead Finance", email: `ci-leads-finance-${Date.now()}@example.invalid`, password: "disposable-ci-only-password", role: "Finance" });
        const base = "http://127.0.0.1:5000/api/inquiries";
        const request = (path, method = "GET", body, admin = sales) => fetch(base + path, {
            method,
            headers: {
                ...(admin ? { Authorization: `Bearer ${jwt.sign({ id: admin._id, v: 0 }, process.env.JWT_SECRET)}` } : {}),
                "Content-Type": "application/json",
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const guest = { fullName: "CI Lead", email: "guest@example.invalid", whatsappNumber: "+94771234567", country: "UK", message: "CI inquiry" };
        const manual = async (fields) => {
            const response = await request("/manual", "POST", { ...guest, ...fields });
            assert.equal(response.status, 201, `Manual inquiry: ${await response.clone().text()}`);
            const inquiry = (await response.json()).inquiry;
            ids.push(inquiry._id);
            return inquiry;
        };

        assert.equal((await request("/manual", "POST", guest, finance)).status, 403);
        assert.equal((await request("/manual", "POST", { ...guest, status: "Cancelled" })).status, 400);
        const referral = await manual({ source: "Referral", priority: "High" });
        assert.equal(referral.source, "Referral");
        const lost = await manual({ source: "Facebook", status: "Cancelled", lossReason: "Budget" });
        const unlinked = await manual({ source: "WhatsApp", status: "Converted" });
        assert.equal(unlinked.status, "Converted");
        const legacy = await Inquiry.create({ ...guest, source: "Instagram", status: "Cancelled" });
        ids.push(legacy._id);
        const websiteResponse = await request("", "POST", { ...guest, source: "Referral", status: "Cancelled", lossReason: "Other" }, null);
        assert.equal(websiteResponse.status, 201, await websiteResponse.clone().text());
        const website = (await websiteResponse.json()).inquiry;
        ids.push(website._id);
        assert.equal(website.source, "Website");

        booking = await Booking.create({
            inquiry: referral._id,
            customer: { fullName: guest.fullName, email: guest.email, whatsappNumber: guest.whatsappNumber, country: guest.country },
            travelStartDate: new Date("2027-03-01"),
            travelEndDate: new Date("2027-03-03"),
            numberOfTravelers: 1, totalPrice: 100,
            bookingStatus: "Cancelled",
        });

        assert.equal((await request("/insights?window=all", "GET", undefined, finance)).status, 403);
        assert.equal((await request("/insights?window=bad")).status, 400);
        const response = await request("/insights?window=90");
        assert.equal(response.status, 200, await response.clone().text());
        const insights = await response.json();
        assert.deepEqual(insights.summary, { inquiries: 5, booked: 1, lost: 2, conversionRate: 20 });
        assert.equal(insights.sources.find(({ source }) => source === "Referral").booked, 1);
        assert.equal(insights.sources.find(({ source }) => source === "Facebook").lost, 1);
        assert.equal(insights.sources.find(({ source }) => source === "WhatsApp").booked, 0);
        assert.deepEqual(insights.reasons.map(({ reason, count }) => [reason, count]), [["Budget", 1], ["Unspecified", 1]]);

        const reopened = await request(`/${lost._id}`, "PUT", { status: "Follow Up" });
        assert.equal(reopened.status, 200, await reopened.clone().text());
        assert.equal((await reopened.json()).inquiry.lossReason, null);
        const updated = await (await request("/insights?window=all")).json();
        assert.equal(updated.summary.lost, 1);
        console.log("Lead insights smoke passed: manual attribution, public isolation, real booking links, legacy reasons, access control.");
    } finally {
        if (booking) await Booking.deleteOne({ _id: booking._id });
        if (ids.length) {
            await ActivityLog.deleteMany({ relatedRecordId: { $in: ids } });
            await Inquiry.deleteMany({ _id: { $in: ids } });
        }
        if (sales) await Admin.deleteOne({ _id: sales._id });
        if (finance) await Admin.deleteOne({ _id: finance._id });
        await mongoose.disconnect();
    }
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
