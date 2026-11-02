const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const app = require("../app");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const BookingPayment = require("../models/BookingPayment");
const ClientPaymentEmail = require("../models/ClientPaymentEmail");
const ActivityLog = require("../models/ActivityLog");

const calendarDate = (instant) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(instant).map(({ type, value }) => [type, value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
};

const main = async () => {
    if (process.env.CI_SMOKE_TESTS !== "true") throw new Error("This smoke test must be explicitly enabled in CI");
    await mongoose.connect(process.env.MONGO_URI);
    const originalFetch = global.fetch;
    const originalEmailEnv = { key: process.env.ZOHO_CPaaS_API_KEY,
        from: process.env.ZOHO_CPaaS_FROM, url: process.env.ZOHO_CPaaS_API_URL };
    const admins = [];
    const providerRequests = [];
    let server;
    let booking;
    try {
        for (const role of ["Sales", "Finance", "Viewer"]) {
            admins.push(await Admin.create({ name: `CI Email ${role}`,
                email: `ci-payment-email-${role}-${Date.now()}@example.invalid`,
                password: "disposable-ci-only-password", role }));
        }
        process.env.ZOHO_CPaaS_API_KEY = "ci-only-fake-key";
        process.env.ZOHO_CPaaS_FROM = "ci-sender@example.invalid";
        process.env.ZOHO_CPaaS_API_URL = "https://cpaas.zoho.com/v1.1/email";
        global.fetch = async (url, options) => {
            const address = String(url);
            if (address.startsWith("http://127.0.0.1:")) return originalFetch(url, options);
            if (address !== process.env.ZOHO_CPaaS_API_URL) throw new Error("Unexpected external request in smoke test");
            providerRequests.push(JSON.parse(options.body));
            return { ok: true, status: 200, json: async () => ({
                message: "OK", request_id: "REQ-SMOKE", data: [{ message: "OK" }],
            }) };
        };
        server = app.listen(0, "127.0.0.1");
        await new Promise((resolve) => server.once("listening", resolve));
        const base = `http://127.0.0.1:${server.address().port}/api`;
        const token = (admin) => jwt.sign({ id: admin._id, v: 0 }, process.env.JWT_SECRET);
        const request = (path, body, admin = admins[1]) => global.fetch(`${base}${path}`, {
            method: "POST", headers: { Authorization: `Bearer ${token(admin)}`, "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const day = 86400000;
        const created = await request("/bookings", {
            customer: { fullName: "CI Email Guest", email: "ci-payment-guest@example.invalid",
                whatsappNumber: "+94771234567", country: "UK" },
            travelStartDate: calendarDate(new Date(Date.now() + 25 * day)),
            travelEndDate: calendarDate(new Date(Date.now() + 30 * day)),
            numberOfTravelers: 2, totalPrice: 1000, currency: "USD",
            paymentDueDate: calendarDate(new Date(Date.now() + 8 * day)),
        }, admins[0]);
        assert.equal(created.status, 201, `Create booking: ${await created.clone().text()}`);
        booking = (await created.json()).booking;
        const recorded = await request("/booking-payments", {
            booking: booking._id, amount: 300, currency: "USD",
            paymentDate: calendarDate(new Date()), paymentType: "Advance", status: "Received",
            paymentMethod: "PayHere", referenceNumber: `CI-EMAIL-REF-${Date.now()}`,
        });
        assert.equal(recorded.status, 201, `Record payment: ${await recorded.clone().text()}`);
        const payment = (await recorded.json()).payment;
        const path = `/booking-pdf/payment-email/${payment._id}`;
        assert.equal((await request(`${path}/preview`, {}, admins[0])).status, 403);
        const needsCharge = await (await request(`${path}/preview`, {})).json();
        assert.equal(needsCharge.ready, false);
        assert.equal(needsCharge.to, "ci-payment-guest@example.invalid");
        const previewResponse = await request(`${path}/preview`, { chargedAmount: "309.00" });
        assert.equal(previewResponse.status, 200, `Email preview: ${await previewResponse.clone().text()}`);
        const preview = await previewResponse.json();
        assert.equal(preview.feeCents, 900);
        assert.equal(preview.balanceCents, 70000);
        assert.equal(preview.attachments.length, 2);
        assert.equal((await request(`${path}/send`, {
            chargedAmount: "309.00", fingerprint: preview.fingerprint, confirmRecipient: true,
        }, admins[2])).status, 403);
        assert.equal((await request(`${path}/send`, {
            chargedAmount: "309.00", fingerprint: preview.fingerprint, confirmRecipient: false,
        })).status, 400);
        assert.equal((await request(`${path}/send`, {
            chargedAmount: "310.00", fingerprint: preview.fingerprint, confirmRecipient: true,
        })).status, 409);
        const sent = await request(`${path}/send`, {
            chargedAmount: "309.00", fingerprint: preview.fingerprint, confirmRecipient: true,
        });
        assert.equal(sent.status, 200, `Send email: ${await sent.clone().text()}`);
        assert.equal(providerRequests.length, 1);
        assert.equal(providerRequests[0].to[0].email_address.address, preview.to);
        assert.deepEqual(providerRequests[0].attachments.map(({ name, content }) => [
            name, Buffer.from(content, "base64").subarray(0, 4).toString(),
        ]), preview.attachments.map((name) => [name, "%PDF"]));
        assert.equal((await request(`${path}/send`, {
            chargedAmount: "309.00", fingerprint: preview.fingerprint, confirmRecipient: true,
        })).status, 409);
        assert.equal(providerRequests.length, 1);
        assert.equal((await (await request(`${path}/preview`, { chargedAmount: "309.00" })).json()).deliveryStatus, "Sent");
        assert.ok(await ActivityLog.findOne({ relatedRecordId: payment._id, action: "SEND", status: "Success" }));
        console.log("Reviewed payment email, provider PDF attachments, authorization and duplicate guard passed.");
    } finally {
        global.fetch = originalFetch;
        for (const [key, value] of [["ZOHO_CPaaS_API_KEY", originalEmailEnv.key],
            ["ZOHO_CPaaS_FROM", originalEmailEnv.from], ["ZOHO_CPaaS_API_URL", originalEmailEnv.url]]) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
        if (server) await new Promise((resolve) => server.close(resolve));
        if (booking) {
            const paymentIds = (await BookingPayment.find({ booking: booking._id }).select("_id").lean())
                .map((payment) => payment._id);
            await ClientPaymentEmail.deleteMany({ booking: booking._id });
            await BookingPayment.deleteMany({ booking: booking._id });
            await ActivityLog.deleteMany({ relatedRecordId: { $in: [booking._id, ...paymentIds] } });
            await Booking.deleteOne({ _id: booking._id });
        }
        if (admins.length) await Admin.deleteMany({ _id: { $in: admins.map((admin) => admin._id) } });
        await mongoose.disconnect();
    }
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
