const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
const app = require("../app");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const CompanySetting = require("../models/CompanySetting");
const ActivityLog = require("../models/ActivityLog");
const { buildHotelCancellationDraft } = require("../utils/hotelCancellationDraft");

const exampleBooking = () => new Booking({
    _id: "507f1f77bcf86cd799439301", bookingCode: "DCJ-CANCEL-TEST", bookingStatus: "Cancelled",
    cancellationReason: "PRIVATE-REASON: guest health", adminNotes: "PRIVATE-ADMIN",
    customer: { fullName: "Ashlee Reed", email: "PRIVATE-GUEST@example.com",
        whatsappNumber: "+447700900123", country: "UK" },
    travelStartDate: "2027-02-27", travelEndDate: "2027-03-13", numberOfTravelers: 2,
    totalPrice: 1200, advancePayment: 600,
    hotelStays: [{ _id: "507f1f77bcf86cd799439302", hotelName: "Laluna Bentota",
        checkInDate: "2027-03-11T00:00:00Z", checkOutDate: "2027-03-12T00:00:00Z",
        rooms: 1, roomType: "Superior double", mealPlan: "Bed & Breakfast", status: "Confirmed",
        supplierEmail: "reservations@hotel.example", confirmationNumber: "HB-123",
        cancellationTerms: "PRIVATE-TERMS", notes: "PRIVATE-SUPPLIER-NOTE" }],
});

test("cancellation email requests written confirmation and charges without exposing private data or implying a refund", () => {
    const booking = exampleBooking();
    const before = booking.toObject();
    const { value } = buildHotelCancellationDraft(booking, booking.hotelStays[0], {
        companyName: "Dream Ceylon Journeys", email: "info@dreamceylonjourneys.com",
        bankDetails: "PRIVATE-BANK",
    });
    assert.equal(value.recipient, "reservations@hotel.example");
    assert.match(value.subject, /Cancellation request \| DCJ-CANCEL-TEST \| Laluna Bentota/);
    for (const detail of ["Ashlee Reed", "Mar 11, 2027", "Mar 12, 2027", "1 room",
        "Superior double", "HB-123", "confirm in writing", "cancellation charge", "agreed terms"]) {
        assert.ok(value.body.includes(detail), detail);
    }
    for (const privateValue of ["PRIVATE", "1200", "600", "+447700900123", "refund guaranteed"]) {
        assert.ok(!JSON.stringify(value).includes(privateValue), privateValue);
    }
    assert.deepEqual(value.missingDetails, []);
    assert.deepEqual(booking.toObject(), before);
});

test("draft distinguishes a pending request and flags missing details without guessing hotel policy", () => {
    const booking = exampleBooking();
    const stay = booking.hotelStays[0];
    stay.status = "Requested";
    stay.supplierEmail = "";
    booking.customer.fullName = "";
    stay.checkInDate = new Date("2027-03-10T18:30:00Z");
    const { value } = buildHotelCancellationDraft(booking, stay);
    assert.match(value.body, /reservation request/);
    assert.match(value.body, /Mar 11, 2027/);
    assert.deepEqual(value.missingDetails, ["Supplier email", "Lead guest name"]);
    stay.status = "Confirmed";
    stay.confirmationNumber = "";
    assert.deepEqual(buildHotelCancellationDraft(booking, stay).value.missingDetails,
        ["Supplier email", "Lead guest name", "Hotel confirmation reference"]);
});

test("draft rejects active trips, closed stays and invalid reservation details", () => {
    const booking = exampleBooking();
    const stay = booking.hotelStays[0];
    for (const status of ["Pending", "Confirmed", "In Progress", "Completed"]) {
        booking.bookingStatus = status;
        assert.match(buildHotelCancellationDraft(booking, stay).error, /Cancel the booking/);
    }
    booking.bookingStatus = "Cancelled";
    stay.status = "Cancelled";
    assert.match(buildHotelCancellationDraft(booking, stay).error, /Only open/);
    stay.status = "Confirmed";
    stay.checkOutDate = stay.checkInDate;
    assert.match(buildHotelCancellationDraft(booking, stay).error, /valid check-in/);
});

test("cancellation draft endpoint reloads saved state, enforces access and has no write side effects", async (t) => {
    const booking = exampleBooking();
    const stay = booking.hotelStays[0];
    const salesId = "507f1f77bcf86cd799439303";
    const viewerId = "507f1f77bcf86cd799439304";
    const financeId = "507f1f77bcf86cd799439305";
    let reads = 0;
    let writes = 0;
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({
        _id: id, role: String(id) === viewerId ? "Viewer" : String(id) === financeId ? "Finance" : "Sales",
        status: "Active", tokenVersion: 0,
    }) }));
    t.mock.method(Booking, "findById", (id) => ({ select: async (fields) => {
        assert.equal(fields, "bookingCode bookingStatus customer.fullName hotelStays");
        reads += 1;
        return String(id) === String(booking._id) ? booking : null;
    } }));
    t.mock.method(Booking, "updateOne", async () => { writes += 1; });
    t.mock.method(ActivityLog, "create", async () => { writes += 1; });
    t.mock.method(CompanySetting, "findOne", async () => ({ companyName: "Custom Tour Company", email: "team@company.example" }));
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const endpoint = `http://127.0.0.1:${server.address().port}/api/bookings/${booking._id}/hotel-stays/${stay._id}/cancellation-draft`;
    const request = (url = endpoint, id = salesId) => fetch(url, { headers: id ? {
        Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}`,
    } : {} });

    assert.equal((await request(endpoint, null)).status, 401);
    assert.equal((await request(endpoint, viewerId)).status, 403);
    assert.equal((await request(endpoint, financeId)).status, 403);
    assert.equal((await request(endpoint.replace(String(booking._id), "bad"))).status, 400);
    assert.equal((await request(endpoint.replace(String(stay._id), "bad"))).status, 400);
    assert.equal(reads, 0);
    assert.equal((await request(endpoint.replace(String(booking._id), "507f1f77bcf86cd799439399"))).status, 404);
    assert.equal((await request(endpoint.replace(String(stay._id), "507f1f77bcf86cd799439399"))).status, 404);
    const response = await request();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const draft = await response.json();
    assert.match(draft.body, /Custom Tour Company/);
    assert.ok(!JSON.stringify(draft).includes("PRIVATE"));
    stay.confirmationNumber = "NEW-REF";
    assert.match((await (await request()).json()).body, /NEW-REF/);
    booking.bookingStatus = "Confirmed";
    assert.equal((await request()).status, 409);
    booking.bookingStatus = "Cancelled";
    stay.status = "Cancelled";
    assert.equal((await request()).status, 409);
    assert.equal(writes, 0);
});
