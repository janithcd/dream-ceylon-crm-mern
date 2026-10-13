const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
process.env.ZOHO_CPaaS_API_KEY = "synthetic-test-key";
process.env.ZOHO_CPaaS_FROM = "admin@example.test";
process.env.AUTH_RATE_LIMIT_MAX = "1000";
process.env.PASSWORD_RESET_RATE_LIMIT_MAX = "1000";

const app = require("../app");
const Admin = require("../models/Admin");
const mail = require("../utils/transactionalEmail");

const get = (object, path) => path.split(".").reduce((value, key) => value?.[key], object);
const set = (object, path, value) => {
    const keys = path.split(".");
    let target = object;
    for (const key of keys.slice(0, -1)) target = target[key] ||= {};
    target[keys.at(-1)] = value;
};
const unset = (object, path) => {
    const keys = path.split(".");
    const target = keys.slice(0, -1).reduce((value, key) => value?.[key], object);
    if (target) delete target[keys.at(-1)];
};
const matches = (admin, query) => Object.entries(query).every(([key, expected]) => {
    if (key === "$or") return expected.some((branch) => matches(admin, branch));
    const actual = get(admin, key);
    if (expected && typeof expected === "object" && !(expected instanceof Date)) {
        return Object.entries(expected).every(([operator, value]) => {
            if (operator === "$exists") return (actual !== undefined) === value;
            if (operator === "$ne") return actual !== value;
            if (operator === "$lt") return actual !== undefined && actual < value;
            if (operator === "$lte") return actual !== undefined && actual <= value;
            if (operator === "$gt") return actual !== undefined && actual > value;
            throw new Error(`Unexpected query operator ${operator}`);
        });
    }
    return actual === expected;
});
const update = (admin, changes) => {
    for (const [path, value] of Object.entries(changes.$set || {})) set(admin, path, value);
    for (const path of Object.keys(changes.$unset || {})) unset(admin, path);
    for (const [path, amount] of Object.entries(changes.$inc || {})) set(admin, path, (get(admin, path) || 0) + amount);
};

test("recovery codes expire, lock after five guesses, and reset passwords only once", async (t) => {
    const admin = {
        _id: "507f1f77bcf86cd799439011", email: "admin@example.test", status: "Active",
        tokenVersion: 0, password: await bcrypt.hash("OldPassword123!", 10),
    };
    const sent = [];
    let mailFailure = false;
    t.mock.method(Admin, "findOne", (query) => ({
        select: async () => matches(admin, query) ? { _id: admin._id } : null,
    }));
    t.mock.method(Admin, "findOneAndUpdate", async (query, changes) => {
        if (!matches(admin, query)) return null;
        update(admin, changes);
        return { _id: admin._id };
    });
    t.mock.method(Admin, "updateOne", async (query, changes) => {
        if (!matches(admin, query)) return { modifiedCount: 0 };
        update(admin, changes);
        return { modifiedCount: 1 };
    });
    t.mock.method(Admin, "findById", () => ({ select: async () => admin }));
    t.mock.method(mail, "sendPasswordResetCode", async ({ to, code }) => {
        if (mailFailure) throw new Error("simulated delivery outage");
        sent.push({ to, code });
    });
    t.mock.method(console, "error", () => {});
    t.mock.method(console, "info", () => {});

    const server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = async (path, body) => {
        const response = await fetch(base + `/api/auth/${path}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
        });
        return { status: response.status, body: await response.json() };
    };

    const unknown = await post("forgot-password", { email: "nobody@example.test" });
    assert.equal(unknown.status, 200);
    const requested = await post("forgot-password", { email: "ADMIN@example.test" });
    assert.equal(requested.status, 200);
    assert.deepEqual(unknown.body, requested.body);
    assert.equal(sent.length, 1);
    assert.match(sent[0].code, /^\d{6}$/);
    assert.notEqual(admin.passwordReset.codeHash, sent[0].code);
    assert.equal((await post("forgot-password", { email: admin.email })).status, 200);
    assert.equal(sent.length, 1, "cooldown stops duplicate delivery");

    const incorrectCode = sent[0].code === "999999" ? "888888" : "999999";
    for (let i = 0; i < 5; i++) {
        assert.equal((await post("verify-reset-code", { email: admin.email, code: "abcdef" })).status, 400);
        assert.equal((await post("verify-reset-code", { email: admin.email, code: incorrectCode })).status, 400);
    }
    assert.equal(admin.passwordReset.attempts, 5);
    assert.equal((await post("verify-reset-code", { email: admin.email, code: sent[0].code })).status, 400);

    admin.passwordReset.sentAt = new Date(Date.now() - 61000);
    await post("forgot-password", { email: admin.email });
    admin.passwordReset.expiresAt = new Date(Date.now() - 1);
    assert.equal((await post("verify-reset-code", { email: admin.email, code: sent.at(-1).code })).status, 400);

    admin.passwordReset.sentAt = new Date(Date.now() - 61000);
    await post("forgot-password", { email: admin.email });
    const verified = await post("verify-reset-code", { email: admin.email, code: sent.at(-1).code });
    assert.equal(verified.status, 200);
    assert.match(verified.body.resetToken, /^[a-f0-9]{64}$/);
    assert.equal(admin.passwordReset.codeHash, undefined);
    assert.equal((await post("verify-reset-code", { email: admin.email, code: sent.at(-1).code })).status, 400);

    const oldJwt = jwt.sign({ id: admin._id, v: 0 }, process.env.JWT_SECRET);
    assert.equal((await post("reset-password", { email: admin.email, resetToken: verified.body.resetToken, password: "short" })).status, 400);
    const wrongToken = crypto.randomBytes(32).toString("hex");
    assert.equal((await post("reset-password", { email: admin.email, resetToken: wrongToken, password: "NewPassword123!" })).status, 400);
    assert.equal((await post("reset-password", { email: admin.email, resetToken: verified.body.resetToken, password: "NewPassword123!" })).status, 200);
    assert.equal(await bcrypt.compare("NewPassword123!", admin.password), true);
    assert.equal(admin.tokenVersion, 1);
    assert.equal((await post("reset-password", { email: admin.email, resetToken: verified.body.resetToken, password: "AnotherPassword123!" })).status, 400);
    const profile = await fetch(base + "/api/auth/profile", { headers: { Authorization: `Bearer ${oldJwt}` } });
    assert.equal(profile.status, 401, "password reset ends prior sessions");

    mailFailure = true;
    await post("forgot-password", { email: admin.email });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(admin.passwordReset, undefined, "failed delivery removes unused code");
});

test("transactional email uses Zoho CPaaS with an isolated server-side key", async (t) => {
    const fetchCalls = [];
    t.mock.method(global, "fetch", async (url, options) => {
        fetchCalls.push({ url: String(url), options });
        return { ok: true, status: 200, json: async () => ({
            data: [{ code: "EM_104", message: "OK" }], message: "OK", request_id: "req-example",
        }) };
    });
    const requestId = await mail.sendPasswordResetCode({ to: "admin@example.test", code: "000123" });
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, "https://cpaas.zoho.com/v1.1/email");
    assert.equal(fetchCalls[0].options.headers.Authorization, "Zoho-enczapikey synthetic-test-key");
    const body = JSON.parse(fetchCalls[0].options.body);
    assert.equal(body.from.address, "admin@example.test");
    assert.equal(body.to[0].email_address.address, "admin@example.test");
    assert.match(body.textbody, /000123/);
    assert.equal(requestId, "req-example");
});

test("Zoho errors expose safe diagnostic codes without leaking email or OTP", async (t) => {
    t.mock.method(global, "fetch", async () => ({
        ok: false, status: 400, json: async () => ({
            message: "error", data: {
                error_code: "TM_4001", sub_code: "SM_128",
                target_value: "secret@example.test", message: "secret@example.test is blocked",
            },
        }),
    }));
    await assert.rejects(
        mail.sendPasswordResetCode({ to: "secret@example.test", code: "123456" }),
        (error) => {
            assert.match(error.message, /HTTP 400, code TM_4001, sub-code SM_128/);
            assert.doesNotMatch(error.message, /secret@example\.test|123456/);
            return true;
        }
    );
});
