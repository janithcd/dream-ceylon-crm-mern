const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validateEnvironment } = require("../config/validateEnv");
function environment(t, overrides = {}) {
    t.mock.property(process, "env", { NODE_ENV: "production", MONGO_URI: "mongodb://localhost/test", JWT_SECRET: "synthetic-ci-secret-never-use-in-production", CLIENT_URLS: "https://crm.example.test", ...overrides });
    t.mock.method(console, "warn", () => {});
}
test("production environment accepts a strong secret and explicit origins", t => {
    environment(t);
    assert.doesNotThrow(validateEnvironment);
});
test("startup rejects missing database configuration", t => {
    environment(t, { MONGO_URI: " " });
    assert.throws(validateEnvironment, /MONGO_URI/);
});
test("startup rejects short production JWT secrets", t => {
    environment(t, { JWT_SECRET: "short" });
    assert.throws(validateEnvironment, /32 characters/);
});
test("startup rejects missing production CORS configuration", t => {
    environment(t, { CLIENT_URLS: "" });
    assert.throws(validateEnvironment, /CLIENT_URLS/);
});
