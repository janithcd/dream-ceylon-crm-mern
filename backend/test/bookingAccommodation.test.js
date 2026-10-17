const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
process.env.AUTH_RATE_LIMIT_MAX = "1000";

const app = require("../app");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const ActivityLog = require("../models/ActivityLog");
const { parseHotelStay } = require("../utils/bookingAccommodation");

const validStay = {
    hotelName: "  Pelwehera Village  ",
    location: "Sigiriya",
    checkInDate: "2027-02-27",
    checkOutDate: "2027-03-01",
    rooms: 1,
    roomType: "Double",
    mealPlan: "Half Board",
    status: "Requested",
};

test("hotel stay dates, status and rooms are validated before saving", () => {
    assert.equal(parseHotelStay(validStay).value.hotelName, "Pelwehera Village");
    assert.equal(parseHotelStay(validStay).value.checkInDate.toISOString(), "2027-02-27T00:00:00.000Z");
    for (const changes of [
        { checkInDate: "2027-02-30" },
        { checkOutDate: "2027-02-27" },
        { rooms: 0 },
        { rooms: 1.5 },
        { status: "Paid" },
        { mealPlan: "Breakfast?" },
        { hotelName: " ".repeat(2) },
    ]) {
        assert.ok(parseHotelStay({ ...validStay, ...changes }).error, JSON.stringify(changes));
    }
    assert.equal(parseHotelStay({ status: "Confirmed", confirmationNumber: "HV-123" }, parseHotelStay(validStay).value).value.confirmationNumber, "HV-123");
});

test("hotel stays require booking edit permission and can be added, confirmed and removed", async (t) => {
    const bookingId = "507f1f77bcf86cd799439031";
    const salesId = "507f1f77bcf86cd799439032";
    const viewerId = "507f1f77bcf86cd799439033";
    const booking = new Booking({
        _id: bookingId,
        bookingCode: "DCJ-TEST-HOTEL",
        customer: { fullName: "Test Guest", email: "guest@example.test", whatsappNumber: "+94771234567", country: "UK" },
        travelStartDate: new Date("2027-02-27"),
        travelEndDate: new Date("2027-03-13"),
        numberOfTravelers: 2,
        totalPrice: 1000,
    });

    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({
        _id: id,
        role: String(id) === viewerId ? "Viewer" : "Sales",
        status: "Active",
        tokenVersion: 0,
    }) }));
    t.mock.method(ActivityLog, "create", async () => ({}));
    t.mock.method(Booking, "exists", async () => ({ _id: bookingId }));
    t.mock.method(Booking, "findById", () => ({ select: async () => booking }));
    t.mock.method(Booking, "findOneAndUpdate", async (query, update) => {
        if (String(query._id) !== bookingId) return null;
        if (update.$push) {
            if (booking.hotelStays.length >= 50) return null;
            booking.hotelStays.push(update.$push.hotelStays);
        } else {
            const stay = booking.hotelStays.id(query["hotelStays._id"]);
            if (!stay) return null;
            if (update.$set) {
                for (const [key, value] of Object.entries(update.$set)) {
                    stay[key.replace("hotelStays.$.", "")] = value;
                }
            } else if (update.$pull) {
                stay.deleteOne();
            }
        }
        return booking;
    });

    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}/api/bookings/${bookingId}/hotel-stays`;
    const headers = (id) => ({
        Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}`,
        "Content-Type": "application/json",
    });
    const request = (path, method, id, body) => fetch(path, {
        method,
        headers: headers(id),
        body: body === undefined ? undefined : JSON.stringify(body),
    });

    assert.equal((await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: '{}' })).status, 401);
    assert.equal((await request(url, "POST", viewerId, validStay)).status, 403);
    assert.equal((await request(url, "POST", salesId, { ...validStay, checkOutDate: "2027-02-27" })).status, 400);

    const created = await request(url, "POST", salesId, validStay);
    assert.equal(created.status, 201);
    const stay = (await created.json()).hotelStays[0];
    assert.equal(stay.hotelName, "Pelwehera Village");
    assert.equal(stay.mealPlan, "Half Board");

    const stayUrl = `${url}/${stay._id}`;
    const updated = await request(stayUrl, "PUT", salesId, { status: "Confirmed", confirmationNumber: "HV-123" });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).hotelStays[0].confirmationNumber, "HV-123");
    assert.equal((await request(stayUrl, "PUT", viewerId, { status: "Cancelled" })).status, 403);

    assert.equal((await request(stayUrl, "DELETE", salesId)).status, 200);
    assert.equal(booking.hotelStays.length, 0);
    assert.equal((await request(stayUrl, "DELETE", salesId)).status, 404);

    for (let index = 0; index < 50; index += 1) booking.hotelStays.push(parseHotelStay({ ...validStay, hotelName: `Hotel ${index}` }).value);
    assert.equal((await request(url, "POST", salesId, validStay)).status, 409);
});
