const { test } = require("node:test");
const assert = require("node:assert/strict");
const { planBookingCancellation } = require("../utils/bookingCancellation");

test("cancellation requires a specific reason and records a stable actor snapshot", () => {
    const now = new Date("2026-10-26T10:00:00Z");
    for (const reason of [undefined, "", "Too short", "x".repeat(301), 123]) {
        assert.match(planBookingCancellation({ currentStatus: "Confirmed", nextStatus: "Cancelled", reason }).error,
            /reason of 10–300/);
    }
    const result = planBookingCancellation({ currentStatus: "Confirmed", nextStatus: "Cancelled",
        reason: "  Guests  changed\n  their travel plans.  ",
        admin: { _id: "507f1f77bcf86cd799439011", name: "Sales Agent" }, now });
    assert.equal(result.event, "cancelled");
    assert.deepEqual(result.fields, { cancellationReason: "Guests changed their travel plans.",
        cancelledAt: now, cancelledBy: "507f1f77bcf86cd799439011", cancelledByName: "Sales Agent" });
});

test("editing a cancelled booking preserves details; reopening clears current details", () => {
    assert.deepEqual(planBookingCancellation({ currentStatus: "Cancelled", nextStatus: "Cancelled" }),
        { event: null, fields: {} });
    assert.deepEqual(planBookingCancellation({ currentStatus: "Cancelled", nextStatus: "Confirmed" }),
        { event: "reopened", fields: { cancellationReason: "", cancelledAt: null,
            cancelledBy: null, cancelledByName: "" } });
    assert.deepEqual(planBookingCancellation({ currentStatus: "Pending", nextStatus: "Confirmed" }),
        { event: null, fields: {} });
});
