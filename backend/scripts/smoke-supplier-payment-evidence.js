const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const CostEntry = require("../models/CostEntry");
const Attachment = require("../models/SupplierPaymentAttachment");
const ActivityLog = require("../models/ActivityLog");

const main = async () => {
    if (process.env.CI_SMOKE_TESTS !== "true") throw new Error("This smoke test must be explicitly enabled in CI");
    await mongoose.connect(process.env.MONGO_URI);
    const admins = [];
    let booking, cost;
    try {
        for (const role of ["Finance", "Sales"]) admins.push(await Admin.create({ name: `CI Evidence ${role}`,
            email: `ci-evidence-${role}-${Date.now()}@example.invalid`, password: "disposable-ci-only-password", role }));
        const [finance, sales] = admins;
        booking = await Booking.create({ bookingCode: `CI-EVIDENCE-${Date.now()}`, bookingStatus: "Confirmed",
            customer: { fullName: "CI Guest", email: "private@example.invalid", whatsappNumber: "+94771234567", country: "UK" },
            travelStartDate: new Date("2027-03-10"), travelEndDate: new Date("2027-03-11"), numberOfTravelers: 2, totalPrice: 1000 });
        const payment = (reference) => ({ kind: "payment", amount: 100, paidAmountAfter: 100, paymentDate: new Date("2026-01-15"),
            method: "Bank transfer", reference, recordedBy: finance._id, recordedByName: finance.name });
        cost = await CostEntry.create({ recordType: "Booking", recordId: booking._id, category: "Hotel", description: "CI Hotel",
            amount: 500, currency: "USD", conversionRate: 1, targetCurrency: "USD", paidAmount: 200, createdBy: finance._id,
            paymentHistory: [payment("CI-FIRST"), payment("CI-SECOND")] });
        const paymentId = cost.paymentHistory[0]._id, otherId = cost.paymentHistory[1]._id;
        const path = `/finance/costs/${cost._id}/payments/${paymentId}`;
        const token = (admin) => jwt.sign({ id: admin._id, v: 0 }, process.env.JWT_SECRET);
        const request = (suffix, { method = "GET", body, raw, admin = finance, proxy = false, headers = {} } = {}) =>
            fetch(`${proxy ? "http://frontend:8080" : "http://127.0.0.1:5000"}/api${suffix}`, {
                method, headers: { Authorization: `Bearer ${token(admin)}`, "Content-Type": raw ? "application/pdf" : "application/json", ...headers },
                body: raw || (body === undefined ? undefined : JSON.stringify(body)),
            });
        const makePdf = (label, size = 100) => {
            const data = Buffer.alloc(size, 32);
            data.write(`%PDF-1.7\n% ${label}\n`); data.write("\n%%EOF\n", size - 7); return data;
        };
        const upload = (data, options = {}) => request(`${path}/attachments?kind=bank-proof`, {
            method: "POST", raw: data, headers: { "X-File-Name": encodeURIComponent("PRIVATE RECEIPT.pdf") }, ...options });
        assert.equal((await upload(makePdf("unauthorized"), { admin: sales })).status, 403);
        // Exercise Nginx as well as Express: the accepted private upload exceeds the general JSON limit.
        const bytes = makePdf("large receipt", 5 * 1024 * 1024);
        const first = await upload(bytes, { proxy: true });
        assert.equal(first.status, 201, await first.clone().text());
        const firstId = (await first.json()).attachment._id;
        assert.equal((await Attachment.findById(firstId)).data, undefined, "Binary must be excluded from ordinary model queries");
        const download = await request(`${path}/attachments/${firstId}`, { proxy: true });
        assert.equal(download.status, 200);
        assert.equal(download.headers.get("cache-control"), "no-store");
        assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
        assert.equal((await request(`${path.replace(String(paymentId), String(otherId))}/attachments/${firstId}`)).status, 404);
        assert.equal((await upload(bytes)).status, 409, "Duplicate content must not be stored twice");
        assert.equal((await upload(makePdf("too large", 5 * 1024 * 1024 + 1), { proxy: true })).status, 413);
        const concurrent = await Promise.all(Array.from({ length: 8 }, (_, index) => upload(makePdf(`parallel ${index}`))));
        assert.ok(concurrent.every((response) => [201, 409].includes(response.status)), "Concurrent writes must succeed or report a conflict");
        let count = await Attachment.countDocuments({ cost: cost._id, withdrawnAt: null });
        assert.ok(count >= 2 && count <= 5);
        while (count < 5) {
            const response = await upload(makePdf(`fill slot ${count}`));
            assert.equal(response.status, 201, await response.clone().text()); count += 1;
        }
        assert.equal((await upload(makePdf("sixth"))).status, 409);
        const withdrawal = await request(`${path}/attachments/${firstId}/withdraw`, { method: "PATCH", body: { reason: "PRIVATE WITHDRAWAL" } });
        assert.equal(withdrawal.status, 200, await withdrawal.clone().text());
        assert.equal((await request(`${path}/attachments/${firstId}`)).status, 410);
        assert.equal((await Attachment.findById(firstId).select("+data")).data.length, bytes.length);
        assert.equal((await upload(bytes)).status, 201, "Withdrawal frees the active slot and content hash");
        const files = await (await request(`${path}/attachments`)).json();
        assert.equal(files.active.length, 5);
        assert.equal(files.history[0].withdrawalReason, "PRIVATE WITHDRAWAL");
        assert.doesNotMatch(JSON.stringify(files), /sha256|"data"|paymentId/);
        const ack = { action: "acknowledge", expectedVersion: 0, acknowledgedDate: "2026-01-16", channel: "Email",
            contactName: "PRIVATE CONTACT", reference: "PRIVATE CONFIRMATION", note: "PRIVATE INTERNAL NOTE", confirmed: true };
        const acknowledge = await request(`${path}/acknowledgement`, { method: "PATCH", body: ack });
        assert.equal(acknowledge.status, 200, await acknowledge.clone().text());
        assert.equal((await acknowledge.json()).version, 1);
        assert.equal((await request(`${path}/acknowledgement`, { method: "PATCH", body: ack })).status, 409);
        const registerPath = "/finance/costs/payment-register?from=2026-01-01&to=2026-01-31";
        const register = async (filter) => {
            const response = await request(`${registerPath}&${filter}`);
            assert.equal(response.status, 200, await response.clone().text()); return response.json();
        };
        const confirmed = await register("acknowledgement=acknowledged");
        assert.ok(confirmed.items.some((item) => item.paymentId === String(paymentId)));
        assert.ok(!confirmed.items.some((item) => item.paymentId === String(otherId)));
        assert.doesNotMatch(JSON.stringify(confirmed), /PRIVATE CONTACT|PRIVATE INTERNAL NOTE/);
        const waiting = await register("acknowledgement=awaiting");
        assert.ok(waiting.items.some((item) => item.paymentId === String(otherId)));
        assert.ok(!waiting.items.some((item) => item.paymentId === String(paymentId)));
        assert.ok(!(await register("acknowledgement=acknowledged&reference=CI-SECOND")).items.some((item) => item.costId === String(cost._id)));
        const csv = await request(`${registerPath.replace("payment-register?", "payment-register/export?")}&acknowledgement=acknowledged`);
        assert.equal(csv.status, 200);
        const csvText = await csv.text();
        assert.match(csvText, /"Acknowledged","2026-01-16"/);
        assert.doesNotMatch(csvText, /PRIVATE CONTACT|PRIVATE INTERNAL NOTE/);
        const reopen = await request(`${path}/acknowledgement`, { method: "PATCH", body: { action: "reopen", expectedVersion: 1, reason: "PRIVATE CORRECTION" } });
        assert.equal(reopen.status, 200, await reopen.clone().text());
        const state = await (await request(`${path}/acknowledgement`)).json();
        assert.equal(state.current, null);
        assert.equal(state.history.length, 2);
        assert.equal(state.history[1].acknowledgement.reference, ack.reference);
        assert.equal(state.history[1].reason, "PRIVATE CORRECTION");
        const savedCost = await CostEntry.findById(cost._id);
        assert.equal(savedCost.paidAmount, 200);
        assert.equal(savedCost.paymentHistory[0].amount, 100);
        assert.equal(savedCost.paymentHistory[0].reconciledAt, null);
        assert.equal(savedCost.paymentHistory[0].remittanceRevisions.length, 0);
        const logs = await ActivityLog.find({ relatedRecordId: booking._id });
        assert.ok(logs.length >= 8);
        assert.doesNotMatch(JSON.stringify(logs), /PRIVATE/);
        console.log("Private supplier receipts, proxy limits, concurrent uploads, acknowledgement history and register filters passed.");
    } finally {
        if (cost) { await Attachment.deleteMany({ cost: cost._id }); await CostEntry.deleteOne({ _id: cost._id }); }
        if (booking) { await ActivityLog.deleteMany({ relatedRecordId: booking._id }); await Booking.deleteOne({ _id: booking._id }); }
        if (admins.length) await Admin.deleteMany({ _id: { $in: admins.map((admin) => admin._id) } });
        await mongoose.disconnect();
    }
};
main().catch((error) => { console.error(error); process.exitCode = 1; });
