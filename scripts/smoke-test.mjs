import assert from "node:assert/strict";
const base = process.env.SMOKE_BASE_URL || "http://127.0.0.1:8080";
for (const path of ["/", "/bookings", "/healthz", "/api/health/live", "/api/health"]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, `${path} must be available`);
    if (path === "/bookings") assert.match(await response.text(), /<div id="root">/);
    if (path === "/api/health") assert.equal((await response.json()).database, "connected");
}
const index = await fetch(base + "/index.html");
assert.match(index.headers.get("cache-control") || "", /no-cache/, "HTML must refresh after deployments");
const html = await index.text();
const entryPath = html.match(/\bsrc="([^"]+\.js)"/u)?.[1];
assert.ok(entryPath, "frontend must reference a built JavaScript entry");
const entry = await fetch(new URL(entryPath, base));
assert.equal(entry.status, 200, "built JavaScript entry must be available");
assert.match(entry.headers.get("content-type") || "", /javascript/, "entry must be served as JavaScript");
assert.match(entry.headers.get("cache-control") || "", /immutable/, "hashed assets should be cacheable");
assert.equal((await fetch(base + "/assets/missing-chunk.js")).status, 404,
    "missing chunks must not return the SPA HTML");
assert.equal((await fetch(base + "/api/bookings")).status, 401);
assert.equal((await fetch(base + "/api/health/live", { headers: { Origin: "https://untrusted.example.test" } })).status, 403);
console.log("Container smoke tests passed: frontend, route assets, SPA routing, API proxy, MongoDB readiness, auth and CORS.");
