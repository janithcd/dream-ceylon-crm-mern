const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
process.env.NODE_ENV = "production";
process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
process.env.CLIENT_URLS = "https://crm.example.test";
const app = require("../app");
const Admin = require("../models/Admin");
let server, base;
before(async () => {
    server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));
const request = (path, options) => fetch(base + path, { ...options, signal: AbortSignal.timeout(5000) });

test("liveness succeeds without a database connection", async () => {
    const response = await request("/api/health/live");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
    assert.equal(response.headers.get("x-powered-by"), null);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});
test("readiness reports a disconnected database as unavailable", async t => {
    const original = Object.getOwnPropertyDescriptor(mongoose.connection, "readyState");
    Object.defineProperty(mongoose.connection, "readyState", { configurable: true, value: 0 });
    t.after(() => original ? Object.defineProperty(mongoose.connection, "readyState", original) : delete mongoose.connection.readyState);
    const response = await request("/api/health");
    assert.equal(response.status, 503);
    assert.equal((await response.json()).database, "disconnected");
});
test("readiness succeeds when the database is connected", async t => {
    const original = Object.getOwnPropertyDescriptor(mongoose.connection, "readyState");
    Object.defineProperty(mongoose.connection, "readyState", { configurable: true, value: 1 });
    t.after(() => original ? Object.defineProperty(mongoose.connection, "readyState", original) : delete mongoose.connection.readyState);
    const response = await request("/api/health");
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, "ok");
});
test("allowed origins receive CORS headers", async () => {
    const response = await request("/api/health/live", { headers: { Origin: "https://crm.example.test" } });
    assert.equal(response.headers.get("access-control-allow-origin"), "https://crm.example.test");
});
test("untrusted origins are forbidden and do not expose a stack", async t => {
    t.mock.method(console, "error", () => {});
    const response = await request("/api/health/live", { headers: { Origin: "https://untrusted.example.test" } });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.equal((await response.json()).stack, undefined);
});
test("CORS preflight permits authenticated JSON requests", async () => {
    const response = await request("/api/bookings", { method: "OPTIONS", headers: {
        Origin: "https://crm.example.test", "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
    } });
    assert.equal(response.status, 204);
    assert.match(response.headers.get("access-control-allow-headers"), /Authorization/);
});
test("public admin self-registration is unavailable", async () => {
    const response = await request("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(response.status, 404);
});
test("unknown API routes return a JSON 404", async () => {
    const response = await request("/api/no-such-route");
    assert.equal(response.status, 404);
    assert.match((await response.json()).message, /Route not found/);
});
test("malformed JSON produces a 400 without a production stack", async t => {
    t.mock.method(console, "error", () => {});
    const response = await request("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).stack, undefined);
});
for (const path of ["/api/auth/profile", "/api/bookings", "/api/admins", "/api/finance/reports/payments"]) {
    test(`unauthenticated access to ${path} is denied`, async () => {
        assert.equal((await request(path)).status, 401);
    });
}
for (const [label, token] of [
    ["invalid", "invalid-token"],
    ["expired", jwt.sign({ id: "507f1f77bcf86cd799439011" }, process.env.JWT_SECRET, { expiresIn: -10 })],
    ["wrongly signed", jwt.sign({ id: "507f1f77bcf86cd799439011" }, "different-signing-key")],
    ["missing identity", jwt.sign({}, process.env.JWT_SECRET)],
]) {
    test(`${label} JWT is rejected`, async () => {
        assert.equal((await request("/api/bookings", { headers: { Authorization: `Bearer ${token}` } })).status, 401);
    });
}
test("a deleted admin cannot use an otherwise valid JWT", async t => {
    t.mock.method(Admin, "findById", () => ({ select: async () => null }));
    const token = jwt.sign({ id: "507f1f77bcf86cd799439011" }, process.env.JWT_SECRET);
    assert.equal((await request("/api/bookings", { headers: { Authorization: `Bearer ${token}` } })).status, 401);
});
test("an inactive admin cannot use an otherwise valid JWT", async t => {
    t.mock.method(Admin, "findById", () => ({ select: async () => ({ role: "Super Admin", status: "Inactive" }) }));
    const token = jwt.sign({ id: "507f1f77bcf86cd799439011" }, process.env.JWT_SECRET);
    assert.equal((await request("/api/bookings", { headers: { Authorization: `Bearer ${token}` } })).status, 403);
});
