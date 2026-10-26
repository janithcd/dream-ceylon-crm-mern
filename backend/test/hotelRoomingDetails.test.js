const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
process.env.AUTH_RATE_LIMIT_MAX = "1000";
const app = require("../app");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const CompanySetting = require("../models/CompanySetting");
const ActivityLog = require("../models/ActivityLog");
const { buildHotelRoomingDetails } = require("../utils/hotelRoomingDetails");

const exampleBooking = () => new Booking({
    _id: "507f1f77bcf86cd799439201", bookingCode: "DCJ-ROOMING-TEST", bookingStatus: "Confirmed",
    customer: { fullName: "Booking Contact", email: "PRIVATE-CONTACT@example.com", whatsappNumber: "+447700900123", country: "UK" },
    travelStartDate: "2027-03-10", travelEndDate: "2027-03-13", numberOfTravelers: 3,
    travelerNames: ["Ashlee Reed", "Demelza Peake", "Third Guest"],
    totalPrice: 1200, adminNotes: "PRIVATE-ADMIN", specialRequests: "PRIVATE-REQUEST",
    hotelStays: [{
        _id: "507f1f77bcf86cd799439202", hotelName: "Laluna Bentota",
        checkInDate: "2027-03-10T18:30:00Z", checkOutDate: "2027-03-11T18:30:00Z",
        rooms: 2, roomType: "Superior double", mealPlan: "Bed & Breakfast", status: "Confirmed",
        supplierEmail: "reservations@hotel.example", confirmationNumber: "CONF-123", notes: "PRIVATE-HOTEL",
    }],
});

test("rooming details expose only the roster and selected confirmed stay", () => {
    const booking = exampleBooking();
    const before = booking.toObject();
    const { value } = buildHotelRoomingDetails(booking, booking.hotelStays[0], {
        companyName: "Dream Ceylon Journeys", email: "info@dreamceylonjourneys.com", bankDetails: "PRIVATE-BANK",
    });
    assert.deepEqual(value.travelerNames, ["Ashlee Reed", "Demelza Peake", "Third Guest"]);
    assert.equal(value.checkIn, "Mar 11, 2027");
    assert.equal(value.checkOut, "Mar 12, 2027");
    assert.equal(value.recipient, "reservations@hotel.example");
    assert.equal(value.rooms, 2);
    assert.equal(value.rosterVersion, 0);
    assert.deepEqual(value.roomingPlan, { status: "none", revision: 0, assignments: [] });
    assert.deepEqual(value.missingDetails, []);
    for (const secret of ["PRIVATE", "1200", "+447700900123", "Booking Contact"]) {
        assert.ok(!JSON.stringify(value).includes(secret), secret);
    }
    assert.deepEqual(booking.toObject(), before);
});

test("rooming details require a full roster and a valid confirmed active stay", () => {
    const booking = exampleBooking();
    const stay = booking.hotelStays[0];
    booking.travelerNames = ["Ashlee Reed"];
    assert.match(buildHotelRoomingDetails(booking, stay).error, /Complete/);
    booking.travelerNames = ["Ashlee Reed", "Demelza Peake", "Third Guest"];
    for (const bookingStatus of ["Cancelled", "Completed"]) {
        booking.bookingStatus = bookingStatus;
        assert.match(buildHotelRoomingDetails(booking, stay).error, /active booking/);
    }
    booking.bookingStatus = "Confirmed";
    stay.status = "Requested";
    assert.match(buildHotelRoomingDetails(booking, stay).error, /confirmed hotel/);
    stay.status = "Confirmed";
    stay.rooms = 4;
    assert.match(buildHotelRoomingDetails(booking, stay).error, /more reserved rooms/);
    stay.rooms = 2;
    stay.checkOutDate = stay.checkInDate;
    assert.match(buildHotelRoomingDetails(booking, stay).error, /valid hotel/);
});

test("rooming endpoint checks both permissions and reloads the current roster without logging contact", async (t) => {
    const booking = exampleBooking();
    const salesId = "507f1f77bcf86cd799439203";
    const viewerId = "507f1f77bcf86cd799439204";
    let reads = 0;
    let writes = 0;
    let logs = 0;
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({
        _id: id, role: String(id) === viewerId ? "Viewer" : "Sales", status: "Active", tokenVersion: 0,
    }) }));
    t.mock.method(Booking, "findById", (id) => ({ select: async (projection) => {
        assert.match(projection, /travelerRosterVersion/);
        reads += 1;
        return String(id) === String(booking._id) ? booking : null;
    } }));
    t.mock.method(Booking, "updateOne", async () => { writes += 1; });
    t.mock.method(ActivityLog, "create", async () => { logs += 1; });
    t.mock.method(CompanySetting, "findOne", async () => null);
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const stayId = booking.hotelStays[0]._id;
    const endpoint = `http://127.0.0.1:${server.address().port}/api/bookings/${booking._id}/hotel-stays/${stayId}/rooming-details`;
    const request = (url = endpoint, id = salesId) => fetch(url, { headers: id ? {
        Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}`,
    } : {} });

    assert.equal((await request(endpoint, null)).status, 401);
    assert.equal((await request(endpoint, viewerId)).status, 403);
    assert.equal((await request(endpoint.replace(String(stayId), "bad"))).status, 400);
    assert.equal(reads, 0);
    assert.equal((await request(endpoint.replace(String(booking._id), "507f1f77bcf86cd799439299"))).status, 404);
    assert.equal((await request(endpoint.replace(String(stayId), "507f1f77bcf86cd799439299"))).status, 404);
    const response = await request();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual((await response.json()).travelerNames, ["Ashlee Reed", "Demelza Peake", "Third Guest"]);
    booking.hotelStays[0].roomingPlan = { assignments: ["1", "2", "1"], rosterVersion: 0,
        roomCount: 2, savedAt: new Date(), savedByName: "Sales Agent" };
    assert.deepEqual((await (await request()).json()).roomingPlan.assignments, ["1", "2", "1"]);
    booking.travelerRosterVersion = 1;
    const changed = await (await request()).json();
    assert.equal(changed.rosterVersion, 1);
    const stale = changed.roomingPlan;
    assert.equal(stale.status, "stale");
    assert.deepEqual(stale.assignments, []);
    booking.travelerNames = ["Updated Guest", "Demelza Peake", "Third Guest"];
    assert.equal((await (await request()).json()).travelerNames[0], "Updated Guest");
    booking.travelerNames = [];
    assert.equal((await request()).status, 409);
    booking.bookingStatus = "Cancelled";
    assert.equal((await request()).status, 409);
    assert.equal(writes, 0);
    assert.equal(logs, 0);
});
