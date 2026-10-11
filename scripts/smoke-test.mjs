import assert from "node:assert/strict";
const base = process.env.SMOKE_BASE_URL || "http://127.0.0.1:8080";
for (const path of ["/", "/bookings", "/healthz", "/api/health/live", "/api/health"]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, `${path} must be available`);
    if (path === "/bookings") assert.match(await response.text(), /<div id="root">/);
    if (path === "/api/health") assert.equal((await response.json()).database, "connected");
}
assert.equal((await fetch(base + "/api/bookings")).status, 401);
assert.equal((await fetch(base + "/api/health/live", { headers: { Origin: "https://untrusted.example.test" } })).status, 403);
console.log("Container smoke tests passed: frontend, SPA routing, API proxy, MongoDB readiness, auth and CORS.");
