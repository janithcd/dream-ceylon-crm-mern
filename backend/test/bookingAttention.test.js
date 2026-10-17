const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getBookingAttentionQuery, summarizeBookingAttention } = require("../utils/bookingAttention");

test("attention query selects upcoming active bookings with requested hotels or open tasks", () => {
    const query = getBookingAttentionQuery(new Date("2026-10-16T19:00:00Z"));

    assert.equal(query.travelStartDate.$gte.toISOString(), "2026-10-16T18:30:00.000Z");
    assert.equal(query.travelStartDate.$lte.toISOString(), "2026-11-16T18:29:59.999Z");
    assert.deepEqual(query.bookingStatus.$in, ["Pending", "Confirmed", "In Progress"]);
    assert.deepEqual(query.$or, [
        { hotelStays: { $elemMatch: { status: "Requested" } } },
        { preparationTasks: { $elemMatch: { completedAt: null } } },
    ]);
});

test("attention summary counts only requested stays and unfinished tasks", () => {
    assert.deepEqual(summarizeBookingAttention({
        _id: "booking-1",
        bookingCode: "DCJ-1",
        customer: { fullName: "Guest" },
        travelStartDate: "2026-10-20",
        hotelStays: [{ status: "Requested" }, { status: "Confirmed" }, { status: "Cancelled" }, { status: "Requested" }],
        preparationTasks: [{ completedAt: null }, { completedAt: new Date() }, {}],
    }), {
        _id: "booking-1",
        bookingCode: "DCJ-1",
        customerName: "Guest",
        travelStartDate: "2026-10-20",
        pendingHotelCount: 2,
        openTaskCount: 2,
    });

    const empty = summarizeBookingAttention({ _id: "booking-2" });
    assert.equal(empty.pendingHotelCount, 0);
    assert.equal(empty.openTaskCount, 0);
});
