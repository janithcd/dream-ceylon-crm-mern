const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
process.env.AUTH_RATE_LIMIT_MAX = "1000";

const app = require("../app");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const ActivityLog = require("../models/ActivityLog");
const { parseItineraryDay } = require("../utils/bookingItinerary");

const makeBooking = () => new Booking({
    _id: "507f1f77bcf86cd799439081",
    bookingCode: "DCJ-TEST-ITINERARY",
    customer: { fullName: "Test Guest", email: "guest@example.test", whatsappNumber: "+94771234567", country: "UK" },
    travelStartDate: new Date("2027-03-01"), travelEndDate: new Date("2027-03-10"),
    numberOfTravelers: 2, totalPrice: 1000,
});

test("itinerary entry dates and text are checked against booking travel dates", () => {
    const booking = makeBooking();
    const valid = parseItineraryDay({ date: "2027-03-10", title: "  Sigiriya  ", plan: "  Visit the rock  " }, booking);
    assert.equal(valid.value.date.toISOString(), "2027-03-10T00:00:00.000Z");
    assert.equal(valid.value.title, "Sigiriya");
    assert.equal(valid.value.plan, "Visit the rock");
    for (const date of ["2027-02-28", "2027-03-11", "2027-02-30", "2027-03-01T00:00:00Z", ""]) {
        assert.ok(parseItineraryDay({ date, title: "Day" }, booking).error, date);
    }
    assert.match(parseItineraryDay({ date: "2027-03-01", title: " " }, booking).error, /title/);
    assert.match(parseItineraryDay({ date: "2027-03-01", title: "x".repeat(121) }, booking).error, /120/);
    assert.match(parseItineraryDay({ date: "2027-03-01", title: "Day", plan: "x".repeat(801) }, booking).error, /800/);
    assert.match(parseItineraryDay({ date: "2027-03-01", title: "Day", overnightLocation: 123 }, booking).error, /text/);
});

test("schema rejects more than 60 itinerary entries and trip dates that leave entries behind", async () => {
    const booking = makeBooking();
    booking.itineraryDays.push({ date: new Date("2027-03-02"), title: "Day two" });
    await booking.validate();
    booking.travelStartDate = new Date("2027-03-03");
    await assert.rejects(booking.validate(), /Itinerary dates must stay within booking travel dates/);
    booking.travelStartDate = new Date("2027-03-01");
    for (let index = 1; index < 61; index += 1) {
        booking.itineraryDays.push({ date: new Date("2027-03-02"), title: `Entry ${index}` });
    }
    await assert.rejects(booking.validate(), /at most 60 itinerary entries/);
});

test("atomic itinerary push validates without treating the update as a booking document", async (t) => {
    const collectionUpdate = t.mock.method(Booking.collection, "findOneAndUpdate", async () => null);
    await Booking.findOneAndUpdate(
        { _id: makeBooking()._id, travelStartDate: new Date("2027-03-01"), travelEndDate: new Date("2027-03-10") },
        { $push: { itineraryDays: { date: new Date("2027-03-01"), title: "Arrival" } } },
        { returnDocument: "after", runValidators: true }
    );
    assert.equal(collectionUpdate.mock.callCount(), 1);
});

test("itinerary endpoints enforce permissions and support add, edit, list, delete and booking date guard", async (t) => {
    const booking = makeBooking();
    const salesId = "507f1f77bcf86cd799439082";
    const viewerId = "507f1f77bcf86cd799439083";
    const logs = [];

    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({
        _id: id, role: String(id) === viewerId ? "Viewer" : "Sales", status: "Active", tokenVersion: 0,
    }) }));
    t.mock.method(Booking, "findById", async (id) => String(id) === String(booking._id) ? booking : null);
    t.mock.method(Booking, "findOneAndUpdate", async (query, update) => {
        if (String(query._id) !== String(booking._id) || booking.bookingStatus === "Cancelled") return null;
        if (query.travelStartDate && +query.travelStartDate !== +booking.travelStartDate) return null;
        if (query.travelEndDate && +query.travelEndDate !== +booking.travelEndDate) return null;
        if (update.$push) {
            if (booking.itineraryDays.length >= 60) return null;
            booking.itineraryDays.push(update.$push.itineraryDays);
        } else {
            const day = booking.itineraryDays.id(query["itineraryDays._id"]);
            if (!day) return null;
            if (update.$set) {
                for (const [path, value] of Object.entries(update.$set)) day[path.split(".")[2]] = value;
            } else if (update.$pull) {
                day.deleteOne();
            }
        }
        return booking;
    });
    t.mock.method(ActivityLog, "create", async (entry) => { logs.push(entry); return entry; });

    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const root = `http://127.0.0.1:${server.address().port}/api/bookings/${booking._id}`;
    const itineraryUrl = `${root}/itinerary`;
    const request = (path, method, id, body) => fetch(path, {
        method,
        headers: id ? { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}`, "Content-Type": "application/json" } : {},
        body: body === undefined ? undefined : JSON.stringify(body),
    });

    assert.equal((await request(itineraryUrl, "GET")).status, 401);
    assert.equal((await request(itineraryUrl, "GET", viewerId)).status, 200);
    assert.equal((await request(itineraryUrl, "POST", viewerId, { date: "2027-03-01", title: "Arrival" })).status, 403);
    assert.equal((await request(itineraryUrl, "POST", salesId, { date: "2027-03-11", title: "Late" })).status, 400);
    assert.equal((await request(itineraryUrl, "POST", salesId, { date: "2027-03-01", title: " " })).status, 400);

    const created = await request(itineraryUrl, "POST", salesId, { date: "2027-03-03", title: " Sigiriya ", plan: "  Climb the rock  ", overnightLocation: " Habarana " });
    assert.equal(created.status, 201, await created.clone().text());
    const [day] = (await created.json()).days;
    assert.equal(day.title, "Sigiriya");
    assert.equal(day.overnightLocation, "Habarana");
    assert.equal((await (await request(itineraryUrl, "GET", viewerId)).json()).days.length, 1);
    assert.equal((await request(root, "PUT", salesId, { travelStartDate: "2027-03-04" })).status, 400);
    assert.equal(booking.travelStartDate.toISOString(), "2027-03-01T00:00:00.000Z");

    const dayUrl = `${itineraryUrl}/${day._id}`;
    assert.equal((await request(dayUrl, "PUT", viewerId, { date: "2027-03-02", title: "Changed" })).status, 403);
    assert.equal((await request(dayUrl, "PUT", salesId, { date: "2027-02-28", title: "Changed" })).status, 400);
    const edited = await request(dayUrl, "PUT", salesId, { date: "2027-03-02", title: "Temple visit", plan: "Morning", overnightLocation: "Kandy" });
    assert.equal(edited.status, 200, await edited.clone().text());
    assert.equal((await edited.json()).days[0].title, "Temple visit");
    assert.equal((await request(dayUrl, "DELETE", viewerId)).status, 403);
    assert.equal((await request(dayUrl, "DELETE", salesId)).status, 200);
    assert.equal(booking.itineraryDays.length, 0);
    assert.equal((await request(dayUrl, "DELETE", salesId)).status, 404);
    assert.deepEqual(logs.map((log) => log.description), [
        "Itinerary entry added for booking DCJ-TEST-ITINERARY",
        "Itinerary entry updated for booking DCJ-TEST-ITINERARY",
        "Itinerary entry removed for booking DCJ-TEST-ITINERARY",
    ]);
    assert.equal((await request(`${root.replace(String(booking._id), "bad")}/itinerary`, "GET", salesId)).status, 400);
});
