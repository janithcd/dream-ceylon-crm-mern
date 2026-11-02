import assert from "node:assert/strict";
import { test } from "node:test";
import { readSavedAdmin } from "./savedAdmin.js";

test("a corrupted saved session returns to login without crashing the app", () => {
    let removed = false;
    assert.equal(readSavedAdmin({ getItem: () => "{bad json", removeItem: () => { removed = true; } }), null);
    assert.equal(removed, true);
    assert.equal(readSavedAdmin({ getItem: () => '"wrong shape"' }), null);
    assert.deepEqual(readSavedAdmin({ getItem: () => '{"token":"test-token","name":"A"}' }),
        { token: "test-token", name: "A" });
});
