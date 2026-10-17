const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

for (const timezone of ["UTC", "Asia/Colombo", "America/Los_Angeles"]) {
    test(`upcoming departures use Colombo dates on a ${timezone} server`, () => {
        const script = `
            const assert = require('node:assert/strict');
            const { getUpcomingDepartureQuery } = require('./utils/upcomingDepartures');
            const query = getUpcomingDepartureQuery(new Date('2026-10-16T19:00:00Z'));
            assert.equal(query.travelStartDate.$gte.toISOString(), '2026-10-16T18:30:00.000Z');
            assert.equal(query.travelStartDate.$lte.toISOString(), '2026-11-16T18:29:59.999Z');
            assert.deepEqual(query.bookingStatus.$in, ['Pending', 'Confirmed', 'In Progress']);
            assert.ok(new Date('2026-10-17T00:00:00Z') >= query.travelStartDate.$gte);
            assert.ok(new Date('2026-10-16T00:00:00Z') < query.travelStartDate.$gte);
        `;
        const result = spawnSync(process.execPath, ["-e", script], {
            cwd: path.join(__dirname, ".."),
            env: { ...process.env, TZ: timezone },
            encoding: "utf8",
        });
        assert.equal(result.status, 0, result.stderr);
    });
}
