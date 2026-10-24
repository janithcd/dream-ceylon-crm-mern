import test from "node:test";
import assert from "node:assert/strict";
import { escapeCsvValue } from "./csvExport.js";

test("CSV exports keep numbers and escape spreadsheet formulas in user text", () => {
    assert.equal(escapeCsvValue(120.50), "120.5");
    assert.equal(escapeCsvValue(-12.50), "-12.5");
    assert.equal(escapeCsvValue('=HYPERLINK("a")'), "\"'=HYPERLINK(\"\"a\"\")\"");
    assert.equal(escapeCsvValue(" +SUM(1,2)"), "\"' +SUM(1,2)\"");
    assert.equal(escapeCsvValue("ordinary, text"), '"ordinary, text"');
});
