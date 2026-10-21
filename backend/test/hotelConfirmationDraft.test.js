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
const { buildHotelConfirmationDraft } = require("../utils/hotelConfirmationDraft");

const exampleBooking = () => new Booking({
    _id: "507f1f77bcf86cd799439201", bookingCode: "DCJ-HOTEL-TEST", bookingStatus: "Confirmed",
    customer: { fullName: "Ashlee Reed", email: "PRIVATE-GUEST@example.com", whatsappNumber: "+447700900123", country: "UK" },
    travelStartDate: "2027-02-27", travelEndDate: "2027-03-13", numberOfTravelers: 2,
    totalPrice: 1200, advancePayment: 600, adminNotes: "PRIVATE-ADMIN", specialRequests: "PRIVATE-REQUEST",
    hotelStays: [{
        _id: "507f1f77bcf86cd799439202", hotelName: "Laluna Bentota", location: "Bentota",
        checkInDate: "2027-03-11T00:00:00Z", checkOutDate: "2027-03-12T00:00:00Z",
        rooms: 1, roomType: "Superior double", mealPlan: "Bed & Breakfast", status: "Requested",
        supplierEmail: "reservations@hotel.example", notes: "PRIVATE-SUPPLIER-NOTE",
        followUpDate: "2027-03-01", confirmationNumber: "PRIVATE-REFERENCE",
    }],
});

test("confirmation draft uses saved stay details but excludes costs, private notes and guest contact", () => {
    const booking = exampleBooking();
    const stay = booking.hotelStays[0];
    const before = booking.toObject();
    const { value } = buildHotelConfirmationDraft(booking, stay, { companyName: "Dream Ceylon Journeys", email: "info@dreamceylonjourneys.com", bankDetails: "PRIVATE-BANK" });
    assert.equal(value.recipient, "reservations@hotel.example");
    assert.match(value.subject, /DCJ-HOTEL-TEST \| Laluna Bentota/);
    for (const detail of ["Ashlee Reed", "Mar 11, 2027", "Mar 12, 2027", "1 night", "1 room", "Superior double", "Bed & Breakfast", "info@dreamceylonjourneys.com"]) {
        assert.ok(value.body.includes(detail), detail);
    }
    for (const privateValue of ["PRIVATE", "1200", "600", "+447700900123", "numberOfTravelers"]) {
        assert.ok(!JSON.stringify(value).includes(privateValue), privateValue);
    }
    assert.deepEqual(value.missingDetails, []);
    assert.deepEqual(booking.toObject(), before);
});

test("draft makes missing values explicit and respects Sri Lanka dates", () => {
    const booking = exampleBooking();
    booking.customer.fullName = "";
    const stay = booking.hotelStays[0];
    stay.supplierEmail = "";
    stay.roomType = "";
    stay.checkInDate = new Date("2027-03-10T18:30:00Z");
    stay.checkOutDate = new Date("2027-03-12T18:30:00Z");
    const { value } = buildHotelConfirmationDraft(booking, stay, { companyName: "Custom Company" });
    assert.match(value.body, /Mar 11, 2027/);
    assert.match(value.body, /Mar 13, 2027/);
    assert.match(value.body, /2 nights/);
    assert.match(value.body, /To be confirmed/);
    assert.match(value.body, /Custom Company/);
    assert.deepEqual(value.missingDetails, ["Supplier email", "Lead guest name", "Room type"]);
});

test("only requested stays on active bookings with valid dates can produce a draft", () => {
    const booking = exampleBooking();
    const stay = booking.hotelStays[0];
    for (const bookingStatus of ["Pending", "Confirmed", "In Progress"]) {
        booking.bookingStatus = bookingStatus;
        assert.ok(buildHotelConfirmationDraft(booking, stay).value);
    }
    for (const bookingStatus of ["Completed", "Cancelled"]) {
        booking.bookingStatus = bookingStatus;
        assert.match(buildHotelConfirmationDraft(booking, stay).error, /active bookings/);
    }
    booking.bookingStatus = "Confirmed";
    for (const status of ["Confirmed", "Cancelled"]) {
        stay.status = status;
        assert.match(buildHotelConfirmationDraft(booking, stay).error, /Only requested/);
    }
    stay.status = "Requested";
    stay.checkOutDate = stay.checkInDate;
    assert.match(buildHotelConfirmationDraft(booking, stay).error, /valid check-in/);
});

test("confirmation endpoint enforces permissions, reloads the stay, and records no contact", async (t) => {
    const booking = exampleBooking();
    const stay = booking.hotelStays[0];
    const salesId = "507f1f77bcf86cd799439203";
    const viewerId = "507f1f77bcf86cd799439204";
    const updateOnlyId = "507f1f77bcf86cd799439205";
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
        if (failRead) throw new Error("synthetic database failure");
        return String(id) === String(booking._id) ? booking : null;
    } }));
    t.mock.method(Booking, "updateOne", async () => { writes += 1; });
    t.mock.method(ActivityLog, "create", async () => { logs += 1; });
    t.mock.method(CompanySetting, "findOne", async () => ({ companyName: "Custom Tour Company", email: "team@company.example" }));
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const endpoint = `http://127.0.0.1:${server.address().port}/api/bookings/${booking._id}/hotel-stays/${stay._id}/confirmation-draft`;
    const request = (url = endpoint, id = salesId) => fetch(url, { headers: id ? { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` } : {} });

    assert.equal((await request(endpoint, null)).status, 401);
    assert.equal((await request(endpoint, viewerId)).status, 403);
    assert.equal((await request(endpoint, updateOnlyId)).status, 403);
    assert.equal((await request(endpoint.replace(String(booking._id), "bad"))).status, 400);
    assert.equal((await request(endpoint.replace(String(stay._id), "bad"))).status, 400);
    assert.equal(reads, 0);
    assert.equal((await request(endpoint.replace(String(booking._id), "507f1f77bcf86cd799439299"))).status, 404);
    assert.equal((await request(endpoint.replace(String(stay._id), "507f1f77bcf86cd799439299"))).status, 404);

    const response = await request();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const draft = await response.json();
    assert.match(draft.body, /Custom Tour Company/);
    assert.equal(draft.recipient, "reservations@hotel.example");
    assert.ok(!JSON.stringify(draft).includes("PRIVATE"));
    stay.roomType = "Garden view double";
    const refreshed = await (await request()).json();
    assert.match(refreshed.body, /Garden view double/);
    stay.status = "Confirmed";
    assert.equal((await request()).status, 409);
    stay.status = "Cancelled";
    assert.equal((await request()).status, 409);
    stay.status = "Requested";
    booking.bookingStatus = "Completed";
    assert.equal((await request()).status, 409);
    booking.bookingStatus = "Confirmed";
    failRead = true;
    assert.equal((await request()).status, 500);
    assert.equal(writes, 0);
    assert.equal(logs, 0);
});
