const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { getBusinessDayBounds, getBusinessMonthStart } = require("../utils/businessDate");

for (const timezone of ["UTC", "Asia/Colombo", "America/Los_Angeles", "Pacific/Auckland"]) {
    test(`follow-up filters use the Colombo day on a ${timezone} server`, () => {
        const script = `
            const assert = require('node:assert/strict');
            const { getBusinessDayBounds, getBusinessMonthStart } = require('./utils/businessDate');
            const { start, end } = getBusinessDayBounds(new Date('2026-09-05T19:00:00Z'));
            assert.equal(start.toISOString(), '2026-09-05T18:30:00.000Z');
            assert.equal(end.toISOString(), '2026-09-06T18:29:59.999Z');
            assert.equal(getBusinessDayBounds(new Date('2026-09-06T18:30:00Z')).start.toISOString(), '2026-09-06T18:30:00.000Z');
            assert.equal(getBusinessMonthStart(5, new Date('2027-01-01T00:00:00Z')).toISOString(), '2026-07-31T18:30:00.000Z');
        `;
        const result = spawnSync(process.execPath, ["-e", script], {
            cwd: require("node:path").join(__dirname, ".."),
            env: { ...process.env, TZ: timezone },
            encoding: "utf8",
        });
        assert.equal(result.status, 0, result.stderr);
    });
}

test("dates at the boundary are classified once", () => {
    const now = new Date("2026-09-05T19:00:00Z");
    const { start, end } = getBusinessDayBounds(now);
    assert.equal(new Date("2026-09-05T18:29:59.999Z") < start, true);
    assert.equal(new Date("2026-09-06T00:00:00Z") >= start, true);
    assert.equal(new Date("2026-09-06T18:29:59.999Z") <= end, true);
    assert.equal(new Date("2026-09-06T18:30:00Z") > end, true);
    assert.equal(getBusinessMonthStart(0, now).toISOString(), "2026-08-31T18:30:00.000Z");
});
