const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";

const app = require("../app");
const Booking = require("../models/Booking");
const Admin = require("../models/Admin");
const { buildSupplierConfirmationsPipeline } = require("../utils/supplierConfirmations");
const { parseHotelStay } = require("../utils/bookingAccommodation");
const { parseTransportAssignment } = require("../utils/bookingTransport");

test("hotel and transport follow-up dates must be valid and no later than service", () => {
    const stay = { hotelName: "Hotel A", checkInDate: "2027-03-01", checkOutDate: "2027-03-03" };
    const transport = { route: "Airport", startDate: "2027-03-01", endDate: "2027-03-02" };
    assert.equal(parseHotelStay({ ...stay, followUpDate: "2027-02-27" }).value.followUpDate.toISOString(), "2027-02-27T00:00:00.000Z");
    assert.equal(parseTransportAssignment({ ...transport, followUpDate: "2027-02-27" }).value.followUpDate.toISOString(), "2027-02-27T00:00:00.000Z");
    for (const input of ["2027-02-30", "2027-03-02", 123]) {
        assert.ok(parseHotelStay({ ...stay, followUpDate: input }).error);
        assert.ok(parseTransportAssignment({ ...transport, followUpDate: input }).error);
    }
    const existing = parseHotelStay({ ...stay, followUpDate: "2027-02-27" }).value;
    assert.equal(parseHotelStay({ status: "Confirmed" }, existing).value.followUpDate.toISOString(), "2027-02-27T00:00:00.000Z");
    assert.equal(parseHotelStay({ followUpDate: "" }, existing).value.followUpDate, null);
});

test("supplier queue includes both request types with Colombo follow-up boundaries", () => {
    const pipeline = buildSupplierConfirmationsPipeline(
        { type: "transport", dateFilter: "overdue", page: 2 }, new Date("2026-10-16T19:00:00Z")
    );
    assert.deepEqual(pipeline[0].$match.bookingStatus.$in, ["Pending", "Confirmed", "In Progress"]);
    assert.equal(pipeline[0].$match.$or.length, 2);
    const [hotels, transport] = pipeline[1].$project.requests.$concatArrays;
    assert.equal(hotels.$map.in.type, "hotel");
    assert.equal(transport.$map.in.type, "transport");
    assert.deepEqual(pipeline.at(-1).$facet.items[0].$match, {
        type: "transport", followUpDate: { $ne: null, $lt: new Date("2026-10-16T18:30:00.000Z") },
    });
    assert.equal(pipeline.at(-1).$facet.items.at(-3).$skip, 20);

    const dueNow = buildSupplierConfirmationsPipeline(
        { dateFilter: "actionable" }, new Date("2026-10-16T19:00:00Z")
    );
    assert.deepEqual(dueNow.at(-1).$facet.items[0].$match, {
        followUpDate: { $ne: null, $lte: new Date("2026-10-17T18:29:59.999Z") },
    });
    assert.deepEqual(dueNow.at(-1).$facet.total[0].$match, dueNow.at(-1).$facet.items[0].$match);
});

test("supplier queue requires booking view permission and validates filters", async (t) => {
    const viewerId = "507f1f77bcf86cd799439071";
    const blockedId = "507f1f77bcf86cd799439072";
    let aggregateCalls = 0;
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({
        _id: id, role: String(id) === blockedId ? "Unknown Role" : "Viewer", status: "Active", tokenVersion: 0,
    }) }));
    t.mock.method(Booking, "aggregate", async () => {
        aggregateCalls += 1;
        return [{
            summary: [{ open: 2, hotels: 1, transport: 1, overdue: 1, today: 0, noDue: 1 }],
            total: [{ value: 1 }],
            items: [{ type: "hotel", bookingCode: "DCJ-1", title: "Hotel A", followUpDate: null }],
        }];
    });

    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}/api/bookings/supplier-confirmations`;
    const request = (query, id) => fetch(`${url}${query}`, {
        headers: id ? { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` } : {},
    });

    assert.equal((await request("")).status, 401);
    assert.equal((await request("", blockedId)).status, 403);
    for (const query of ["?type=other", "?dateFilter=soon", "?page=0", "?page=1.5"]) {
        assert.equal((await request(query, viewerId)).status, 400);
    }
    assert.equal(aggregateCalls, 0);
    const response = await request("?type=hotel&dateFilter=noDue&page=1", viewerId);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.summary.open, 2);
    assert.equal(data.summary.noDue, 1);
    assert.equal(data.total, 1);
    assert.equal(data.items[0].title, "Hotel A");
    assert.equal(aggregateCalls, 1);

    assert.equal((await request("?dateFilter=actionable", viewerId)).status, 200);
    assert.equal(aggregateCalls, 2);
});
