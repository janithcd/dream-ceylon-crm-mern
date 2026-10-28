const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
const app = require("../app");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const CompanySetting = require("../models/CompanySetting");
const ActivityLog = require("../models/ActivityLog");
const { buildPreArrivalMessage } = require("../utils/preArrivalMessage");

const exampleBooking = () => new Booking({
    _id: "507f1f77bcf86cd799439111", bookingCode: "DCJ-ARRIVAL-TEST", bookingStatus: "Confirmed",
    travelStartDate: new Date("2027-03-01"), travelEndDate: new Date("2027-03-08"),
    customer: { fullName: "Ava\nMorgan", email: "PRIVATE@example.invalid", whatsappNumber: "+44 7700 900123", country: "UK" },
    totalPrice: 54321, advancePayment: 12345, adminNotes: "PRIVATE ADMIN NOTE",
    hotelStays: [{
        hotelName: "Garden Hotel", location: "Negombo", checkInDate: new Date("2027-03-01"),
        checkOutDate: new Date("2027-03-02"), status: "Confirmed", supplierEmail: "PRIVATE@hotel.invalid",
        confirmationNumber: "PRIVATE CONFIRMATION", notes: "PRIVATE SUPPLIER NOTE",
    }],
    transportAssignments: [{
        route: "Airport to Negombo", startDate: new Date("2027-03-01"), endDate: new Date("2027-03-01"),
        status: "Confirmed", chauffeurName: "PRIVATE DRIVER", chauffeurPhone: "PRIVATE PHONE",
        flight: { direction: "Arrival", number: "UL505", date: new Date("2027-03-01"), time: "08:30" },
    }],
});
const now = new Date("2027-02-26T20:00:00Z");

test("pre-arrival draft selects confirmed first-night and arrival facts without private details", () => {
    const { value } = buildPreArrivalMessage(exampleBooking(), {
        companyName: "Custom Tours", whatsapp: "+94775124645", bankDetails: "PRIVATE BANK",
    }, now);
    assert.equal(value.guestName, "Ava Morgan");
    assert.equal(value.number, "+44 7700 900123");
    assert.deepEqual(value.reviewItems, []);
    for (const detail of [
        "Hello Ava Morgan", "Custom Tours", "booking DCJ-ARRIVAL-TEST",
        "Mar 1, 2027 to Mar 8, 2027", "first confirmed stay is Garden Hotel in Negombo",
        "arrival transfer for flight UL505 is confirmed", "+94775124645",
    ]) assert.ok(value.message.includes(detail), detail);
    for (const hidden of ["PRIVATE", "54321", "12345", "supplierEmail", "chauffeur", "08:30"]) {
        assert.equal(JSON.stringify(value).includes(hidden), false, hidden);
    }
    assert.equal(value.message.includes(value.number), false);
});

test("unconfirmed and ambiguous arrangements are review prompts, never guest claims", () => {
    const booking = exampleBooking();
    booking.hotelStays[0].status = "Requested";
    booking.transportAssignments[0].status = "Requested";
    const draft = buildPreArrivalMessage(booking, {}, now).value;
    assert.doesNotMatch(draft.message, /Garden Hotel|flight UL505|arrival transfer/);
    assert.match(draft.reviewItems.join(" "), /No confirmed first-night hotel/);
    assert.match(draft.reviewItems.join(" "), /hotel request is still awaiting confirmation/);
    assert.match(draft.reviewItems.join(" "), /arrival transfer request is still awaiting confirmation/);

    booking.hotelStays[0].status = "Confirmed";
    booking.hotelStays.push({ ...booking.hotelStays[0].toObject(), _id: undefined, hotelName: "Other Hotel" });
    booking.transportAssignments[0].status = "Confirmed";
    booking.transportAssignments.push({ ...booking.transportAssignments[0].toObject(), _id: undefined, flight: {
        direction: "Arrival", number: "UL506", date: new Date("2027-03-01"), time: "09:00",
    } });
    const ambiguous = buildPreArrivalMessage(booking, {}, now).value;
    assert.doesNotMatch(ambiguous.message, /Garden Hotel|Other Hotel|flight UL505|flight UL506/);
    assert.match(ambiguous.reviewItems.join(" "), /Multiple first-night hotels/);
    assert.match(ambiguous.reviewItems.join(" "), /Multiple arrival transfers/);

    booking.hotelStays[0].checkInDate = new Date("2027-03-02");
    booking.hotelStays[1].status = "Cancelled";
    booking.transportAssignments[1].flight.date = new Date("2027-03-02");
    const filtered = buildPreArrivalMessage(booking, {}, now).value;
    assert.doesNotMatch(filtered.message, /Garden Hotel|Other Hotel|UL506/);
    assert.match(filtered.message, /flight UL505/);
});

test("draft requires confirmed booking and future valid trip dates in Sri Lanka", () => {
    const booking = exampleBooking();
    for (const status of ["Pending", "In Progress", "Cancelled", "Completed"]) {
        booking.bookingStatus = status;
        assert.match(buildPreArrivalMessage(booking, {}, now).error, /Confirm the booking/);
    }
    booking.bookingStatus = "Confirmed";
    booking.travelEndDate = new Date("2027-02-28");
    assert.match(buildPreArrivalMessage(booking, {}, now).error, /valid trip dates/);
    booking.travelEndDate = new Date("2027-03-08");
    assert.ok(buildPreArrivalMessage(booking, {}, new Date("2027-02-28T18:29:59Z")).value);
    assert.ok(buildPreArrivalMessage(booking, {}, new Date("2027-03-01T18:30:00Z")).error);
});

test("pre-arrival endpoint enforces permissions, refreshes saved facts and never logs contact", async (t) => {
    const booking = exampleBooking();
    // Keep the live endpoint test independent of the CI runner's calendar date.
    booking.travelStartDate = new Date("2099-03-01");
    booking.travelEndDate = new Date("2099-03-08");
    booking.hotelStays[0].checkInDate = new Date("2099-03-01");
    booking.hotelStays[0].checkOutDate = new Date("2099-03-02");
    booking.transportAssignments[0].flight.date = new Date("2099-03-01");
    const salesId = "507f1f77bcf86cd799439113";
    const viewerId = "507f1f77bcf86cd799439114";
    const updateOnlyId = "507f1f77bcf86cd799439115";
    let reads = 0;
    let writes = 0;
    let logs = 0;
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
    const endpoint = `http://127.0.0.1:${server.address().port}/api/bookings/${booking._id}/pre-arrival-message`;
    const request = (url = endpoint, id = salesId) => fetch(url, {
        headers: id ? { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` } : {},
    });
    assert.equal((await request(endpoint, null)).status, 401);
    assert.equal((await request(endpoint, viewerId)).status, 403);
    assert.equal((await request(endpoint, updateOnlyId)).status, 403);
    assert.equal((await request(endpoint.replace(String(booking._id), "bad"))).status, 400);
    assert.equal(reads, 0);
    assert.equal((await request(endpoint.replace(String(booking._id), "507f1f77bcf86cd799439199"))).status, 404);
    const response = await request();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const draft = await response.json();
    assert.match(draft.message, /Custom Tour Company/);
    assert.equal(draft.number, "+44 7700 900123");
    assert.equal(JSON.stringify(draft).includes("PRIVATE"), false);

    booking.hotelStays[0].hotelName = "Updated Hotel";
    assert.match((await (await request()).json()).message, /Updated Hotel/);
    booking.bookingStatus = "Cancelled";
    assert.equal((await request()).status, 409);
    booking.bookingStatus = "Confirmed";
    failRead = true;
    assert.equal((await request()).status, 500);
    assert.equal(writes, 0);
    assert.equal(logs, 0);
});
