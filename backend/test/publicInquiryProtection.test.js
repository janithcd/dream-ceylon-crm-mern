const { test } = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
const app = require("../app");
const Inquiry = require("../models/Inquiry");
const ActivityLog = require("../models/ActivityLog");
const { publicInquiryFingerprint, validatePublicInquiry } = require("../utils/publicInquiryProtection");

test("the duplicate key preserves different travelers and trip details", () => {
    const trip = { fullName: "Test Traveler", email: "Guest@Example.invalid", whatsappNumber: "+94771234567", country: "UK", message: "Two week trip", numberOfTravelers: 2, travelDate: "2027-03-01" };
    assert.equal(publicInquiryFingerprint(trip), publicInquiryFingerprint({ ...trip, email: "guest@example.invalid", message: "Two  week trip" }));
    assert.notEqual(publicInquiryFingerprint(trip), publicInquiryFingerprint({ ...trip, fullName: "Other Traveler" }));
    assert.notEqual(publicInquiryFingerprint(trip), publicInquiryFingerprint({ ...trip, travelDate: "2027-03-02" }));
});

test("oversized public text is rejected before any database work", () => {
    const response = {
        status(code) { this.code = code; return this; },
        json(body) { this.body = body; return this; },
    };
    let nextCalled = false;
    validatePublicInquiry({ body: { message: "x".repeat(5001) } }, response, () => { nextCalled = true; });
    assert.equal(response.code, 400);
    assert.match(response.body.message, /maximum 5000/);
    assert.equal(nextCalled, false);
});

test("public inquiry protection is shared across both endpoints", async (t) => {
    const stored = new Map();
    const lookups = [];
    t.mock.method(Inquiry, "exists", async (query) => {
        lookups.push(query);
        return [...stored.values()].some((item) => item.publicFingerprint === query.publicFingerprint &&
            item.createdAt >= query.createdAt.$gte);
    });
    t.mock.method(Inquiry, "create", async (payload) => {
        const inquiry = new Inquiry(payload);
        await inquiry.validate();
        inquiry.createdAt = new Date();
        stored.set(String(inquiry._id), inquiry);
        return inquiry;
    });
    t.mock.method(Inquiry, "findById", (id) => ({
        populate() { return this; },
        then(resolve, reject) {
            const inquiry = stored.get(String(id));
            const result = inquiry?.toObject();
            if (result) delete result.publicFingerprint;
            return Promise.resolve(result || null).then(resolve, reject);
        },
    }));
    t.mock.method(ActivityLog, "create", async (payload) => payload);

    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;
    const guest = { fullName: "Test Traveler", email: "Guest@Example.invalid", whatsappNumber: "+94771234567", country: "UK", message: "Two-week trip in March" };
    const post = (path, body) => fetch(base + path, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });

    const trap = await post("/api/inquiries", { ...guest, websiteUrl: "https://spam.example" });
    assert.equal(trap.status, 200);
    assert.deepEqual((await trap.json()).inquiry, null);
    assert.equal(stored.size, 0);

    const first = await post("/api/inquiries", { ...guest, websiteUrl: "" });
    assert.equal(first.status, 201, await first.clone().text());
    const firstBody = await first.json();
    assert.equal(firstBody.inquiry.publicFingerprint, undefined);
    assert.equal(stored.size, 1);
    assert.match([...stored.values()][0].publicFingerprint, /^[a-f0-9]{64}$/);

    const duplicate = await post("/api/public/inquiries", { ...guest, email: "guest@example.invalid", message: "Two-week   trip in March" });
    assert.equal(duplicate.status, 200);
    assert.equal((await duplicate.json()).inquiry, null);
    assert.equal(stored.size, 1);
    assert.equal(lookups.length, 2);
    assert.ok(lookups[1].createdAt.$gte > new Date(Date.now() - 16 * 60 * 1000));

    const changed = await post("/api/public/inquiries", { ...guest, message: "Three-week trip in March" });
    assert.equal(changed.status, 201, await changed.clone().text());
    assert.equal(stored.size, 2);

    const invalid = await post("/api/inquiries", { ...guest, message: ["invalid"] });
    assert.equal(invalid.status, 400);
    assert.equal(stored.size, 2);

    const limited = await post("/api/public/inquiries", { ...guest, message: "Another trip" });
    assert.equal(limited.status, 429);
    assert.equal(stored.size, 2);
});
