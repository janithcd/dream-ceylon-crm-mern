const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
const app = require("../app");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const CompanySetting = require("../models/CompanySetting");
const ActivityLog = require("../models/ActivityLog");
const { buildGuestTransferMessage } = require("../utils/guestTransferMessage");

const exampleBooking = () => new Booking({
    _id: "507f1f77bcf86cd799439101", bookingCode: "DCJ-PICKUP-TEST", bookingStatus: "Confirmed",
    customer: { fullName: "Ava\nMorgan", email: "PRIVATE@example.invalid", whatsappNumber: "+44 7700 900123", country: "UK" },
    totalPrice: 54321, advancePayment: 12345, adminNotes: "PRIVATE ADMIN NOTE",
    specialRequests: "PRIVATE REQUEST", hotelStays: [{ hotelName: "PRIVATE HOTEL" }],
    transportAssignments: [{
        _id: "507f1f77bcf86cd799439102", status: "Confirmed", route: "Hotel to airport",
        startDate: new Date("2027-03-01"), endDate: new Date("2027-03-02"), pickupTime: "23:00",
        pickupLocation: "Hotel lobby", dropoffLocation: "CMB departures",
        chauffeurName: "Sample Chauffeur", chauffeurPhone: "+94770000000", vehicleDescription: "KDH van", registration: "CAB-1234",
        notes: "PRIVATE SUPPLIER NOTE", followUpDate: new Date("2027-02-27"),
        flight: { direction: "Departure", number: "UL505", date: new Date("2027-03-02"), time: "02:00", airport: "CMB", terminal: "Departures" },
    }],
});

test("guest message separates an overnight pickup from the flight and selects only shareable details", () => {
    const booking = exampleBooking();
    const result = buildGuestTransferMessage(booking, booking.transportAssignments[0], {
        companyName: "Dream Ceylon Journeys", whatsapp: "+94775124645", bankDetails: "PRIVATE BANK",
    });
    assert.equal(result.error, undefined);
    const { value } = result;
    assert.equal(value.guestName, "Ava Morgan");
    assert.equal(value.number, "+44 7700 900123");
    assert.deepEqual(value.missingDetails, []);
    for (const detail of [
        "Hello Ava Morgan", "booking DCJ-PICKUP-TEST", "Pickup date: Mar 1, 2027",
        "Pickup time: 23:00 (Sri Lanka time)", "Meeting point: Hotel lobby",
        "Drop-off: CMB departures", "Chauffeur: Sample Chauffeur", "Chauffeur phone: +94770000000",
        "Vehicle: KDH van - CAB-1234", "Departure flight: UL505",
        "Scheduled departure: Mar 2, 2027 at 02:00 (Sri Lanka time)", "Terminal: Departures", "+94775124645",
    ]) assert.ok(value.message.includes(detail), detail);
    for (const hidden of ["PRIVATE", "54321", "12345", "followUpDate", "paymentStatus"]) {
        assert.equal(JSON.stringify(value).includes(hidden), false, hidden);
    }
    assert.equal(value.message.includes(value.number), false, "Recipient number stays outside the draft text");
});

test("missing details remain explicit and local dates are independent of server timezone", () => {
    const booking = exampleBooking();
    const assignment = booking.transportAssignments[0];
    assignment.startDate = new Date("2027-03-01T18:30:00Z");
    assignment.pickupTime = "25:00";
    assignment.pickupLocation = "";
    assignment.chauffeurName = "";
    assignment.chauffeurPhone = "";
    assignment.flight.direction = "Arrival";
    assignment.flight.time = "";
    const { value } = buildGuestTransferMessage(booking, assignment, { companyName: "Sample Tours" });
    assert.match(value.message, /this is Sample Tours/);
    assert.match(value.message, /Pickup date: Mar 2, 2027/);
    assert.match(value.message, /Pickup time: To be confirmed/);
    assert.match(value.message, /Meeting point: To be confirmed/);
    assert.match(value.message, /Arrival flight: UL505/);
    assert.match(value.message, /Scheduled arrival: Mar 2, 2027 at time to be confirmed/);
    assert.deepEqual(value.missingDetails, ["Pickup time", "Meeting point", "Chauffeur", "Chauffeur phone", "Flight time"]);
    assignment.flight = null;
    assert.doesNotMatch(buildGuestTransferMessage(booking, assignment).value.message, /flight:|Scheduled arrival/);
});

test("only confirmed transfers on active bookings can produce a guest draft", () => {
    const booking = exampleBooking();
    const assignment = booking.transportAssignments[0];
    for (const status of ["Cancelled", "Completed"]) {
        booking.bookingStatus = status;
        assert.ok(buildGuestTransferMessage(booking, assignment).error);
    }
    for (const status of ["Pending", "Confirmed", "In Progress"]) {
        booking.bookingStatus = status;
        assert.ok(buildGuestTransferMessage(booking, assignment).value);
    }
    for (const status of ["Requested", "Cancelled"]) {
        assignment.status = status;
        assert.ok(buildGuestTransferMessage(booking, assignment).error);
    }
    assignment.status = "Confirmed";
    assignment.startDate = null;
    assert.match(buildGuestTransferMessage(booking, assignment).error, /valid pickup date/);
});

test("guest draft endpoint enforces permissions and ownership, reloads changes, and never records contact", async (t) => {
    const booking = exampleBooking();
    const assignment = booking.transportAssignments[0];
    const salesId = "507f1f77bcf86cd799439103";
    const viewerId = "507f1f77bcf86cd799439104";
    const updateOnlyId = "507f1f77bcf86cd799439105";
    let reads = 0;
    let logs = 0;
    let writes = 0;
    let failRead = false;
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({
        _id: id, role: String(id) === viewerId ? "Viewer" : String(id) === updateOnlyId ? "Unknown Role" : "Sales",
        customPermissions: String(id) === updateOnlyId ? ["booking.update"] : [], status: "Active", tokenVersion: 0,
    }) }));
    t.mock.method(Booking, "findById", (id) => ({ select: async () => {
        reads += 1;
        if (failRead) throw new Error("synthetic unavailable database");
        return String(id) === String(booking._id) ? booking : null;
    } }));
    t.mock.method(Booking, "updateOne", async () => { writes += 1; });
    t.mock.method(ActivityLog, "create", async () => { logs += 1; });
    t.mock.method(CompanySetting, "findOne", async () => ({ companyName: "Custom Tour Company", whatsapp: "+94775124645" }));
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const endpoint = `http://127.0.0.1:${server.address().port}/api/bookings/${booking._id}/transport-assignments/${assignment._id}/guest-message`;
    const request = (url = endpoint, id = salesId) => fetch(url, {
        headers: id ? { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` } : {},
    });
    assert.equal((await request(endpoint, null)).status, 401);
    assert.equal((await request(endpoint, viewerId)).status, 403);
    assert.equal((await request(endpoint, updateOnlyId)).status, 403);
    assert.equal((await request(endpoint.replace(String(booking._id), "bad"))).status, 400);
    assert.equal((await request(endpoint.replace(String(assignment._id), "bad"))).status, 400);
    assert.equal(reads, 0);
    assert.equal((await request(endpoint.replace(String(booking._id), "507f1f77bcf86cd799439199"))).status, 404);
    assert.equal((await request(endpoint.replace(String(assignment._id), "507f1f77bcf86cd799439199"))).status, 404);
    const response = await request();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const draft = await response.json();
    assert.match(draft.message, /Custom Tour Company/);
    assert.equal(draft.number, "+44 7700 900123");
    assert.equal(JSON.stringify(draft).includes("PRIVATE"), false);

    assignment.chauffeurName = "New Chauffeur";
    assignment.pickupTime = "22:30";
    const refreshed = await (await request()).json();
    assert.match(refreshed.message, /Chauffeur: New Chauffeur/);
    assert.match(refreshed.message, /Pickup time: 22:30/);
    assignment.status = "Cancelled";
    assert.equal((await request()).status, 409);
    assignment.status = "Requested";
    assert.equal((await request()).status, 409);
    assignment.status = "Confirmed";
    booking.bookingStatus = "Completed";
    assert.equal((await request()).status, 409);
    booking.bookingStatus = "Cancelled";
    assert.equal((await request()).status, 409);
    booking.bookingStatus = "Confirmed";
    failRead = true;
    assert.equal((await request()).status, 500);
    assert.equal(logs, 0);
    assert.equal(writes, 0);
});
