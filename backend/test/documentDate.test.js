const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { formatDocumentDate } = require("../utils/documentDate");
for (const timezone of ["UTC", "Asia/Colombo", "America/Los_Angeles", "Pacific/Auckland"]) {
    test(`selected date remains Sep 6 on a ${timezone} host`, () => {
        const result = spawnSync(process.execPath, ["-e", `
            const assert = require('node:assert/strict');
            const { formatDocumentDate } = require('./utils/documentDate');
            for (const value of ['2026-09-06', '2026-09-06T00:00:00.000Z', '2026-09-05T18:30:00.000Z']) {
                assert.equal(formatDocumentDate(value), 'Sep 6, 2026');
            }
        `], { cwd: require("node:path").join(__dirname, ".."), env: { ...process.env, TZ: timezone }, encoding: "utf8" });
        assert.equal(result.status, 0, result.stderr);
    });
}
test("document timestamps use the Sri Lankan business date", () => {
    assert.equal(formatDocumentDate("2026-12-31T20:00:00Z", { month: "long" }), "January 1, 2027");
});
test("empty and invalid dates use the specified fallback", () => {
    assert.equal(formatDocumentDate(null), "-");
    assert.equal(formatDocumentDate("invalid", { fallback: "Not provided" }), "Not provided");
});
