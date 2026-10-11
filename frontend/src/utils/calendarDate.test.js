import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { formatCalendarDate, toCalendarDateInput, todayCalendarDate } from "./calendarDate.js";

for (const timezone of ["UTC", "Asia/Colombo", "America/Los_Angeles", "Pacific/Auckland"]) {
    test(`forms, lists, and today's default agree on a ${timezone} browser`, () => {
        const check = `
            import assert from 'node:assert/strict';
            import { formatCalendarDate, toCalendarDateInput, todayCalendarDate } from './src/utils/calendarDate.js';
            for (const value of ['2026-09-06', '2026-09-06T00:00:00Z', '2026-09-05T18:30:00Z']) {
                assert.equal(toCalendarDateInput(value), '2026-09-06');
                assert.equal(formatCalendarDate(value), 'Sep 6, 2026');
            }
            assert.equal(todayCalendarDate(new Date('2026-09-05T19:00:00Z')), '2026-09-06');
            assert.equal(todayCalendarDate(new Date('2026-09-06T18:29:59Z')), '2026-09-06');
            assert.equal(todayCalendarDate(new Date('2026-09-06T18:30:00Z')), '2026-09-07');
        `;
        const result = spawnSync(process.execPath, ["--input-type=module", "-e", check], {
            cwd: new URL("../../", import.meta.url).pathname,
            env: { ...process.env, TZ: timezone },
            encoding: "utf8",
        });
        assert.equal(result.status, 0, result.stderr);
    });
}

test("invalid calendar input stays blank", () => {
    assert.equal(toCalendarDateInput("invalid"), "");
    assert.equal(formatCalendarDate("invalid"), "-");
});

test("today uses the business date", () => {
    assert.equal(todayCalendarDate(new Date("2026-12-31T20:00:00Z")), "2027-01-01");
    assert.equal(formatCalendarDate("2026-09-06", { month: "long" }), "September 6, 2026");
});
