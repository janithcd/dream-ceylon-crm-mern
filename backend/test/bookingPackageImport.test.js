const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
process.env.AUTH_RATE_LIMIT_MAX = "1000";

const app = require("../app");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const TourPackage = require("../models/TourPackage");
const ActivityLog = require("../models/ActivityLog");
const { buildPackageItineraryImport } = require("../utils/packageItineraryImport");

const bookingId = "507f1f77bcf86cd799439091";
const packageId = "507f1f77bcf86cd799439092";
const salesId = "507f1f77bcf86cd799439093";
const viewerId = "507f1f77bcf86cd799439094";

const makeBooking = () => new Booking({
    _id: bookingId, bookingCode: "DCJ-TEST-IMPORT", selectedPackage: packageId,
    customer: { fullName: "Guest", email: "guest@example.test", whatsappNumber: "+94771234567", country: "UK" },
    travelStartDate: new Date("2027-03-01"), travelEndDate: new Date("2027-03-10"),
    numberOfTravelers: 2, totalPrice: 1000,
});
const makePackage = () => ({
    _id: packageId, title: "Cultural Tour", durationDays: 3,
    itinerary: [
        { day: 3, title: "  Temple visit  ", description: "  See the temple  " },
        { day: 1, title: "Arrival", description: "Airport pickup" },
    ],
});

test("package days become sorted dated entries, with the same trip and text limits as manual entries", () => {
    const booking = makeBooking();
    const tourPackage = makePackage();
    const { days } = buildPackageItineraryImport(tourPackage, booking, "2027-03-02");
    assert.deepEqual(days.map((day) => [day.date.toISOString().slice(0, 10), day.title, day.plan]), [
        ["2027-03-02", "Arrival", "Airport pickup"],
        ["2027-03-04", "Temple visit", "See the temple"],
    ]);
    assert.match(buildPackageItineraryImport(tourPackage, booking, "2027-03-09").error, /within the trip dates/);
    assert.match(buildPackageItineraryImport(tourPackage, booking, "2027-02-30").error, /valid calendar date/);
    assert.match(buildPackageItineraryImport(tourPackage, booking, "").error, /required/);
    assert.match(buildPackageItineraryImport({ ...tourPackage, itinerary: [] }, booking, "2027-03-02").error, /no itinerary/);
    assert.match(buildPackageItineraryImport({ ...tourPackage, durationDays: 0 }, booking, "2027-03-02").error, /invalid duration/);
    assert.match(buildPackageItineraryImport({ ...tourPackage, itinerary: [{ day: 4, title: "Extra" }] }, booking, "2027-03-02").error, /invalid itinerary day/);
    assert.match(buildPackageItineraryImport({ ...tourPackage, itinerary: [{ day: 1, title: "x".repeat(121) }] }, booking, "2027-03-02").error, /120/);
    assert.match(buildPackageItineraryImport({ ...tourPackage, itinerary: [{ day: 1, title: "Day", description: "x".repeat(801) }] }, booking, "2027-03-02").error, /800/);
    assert.match(buildPackageItineraryImport({ ...tourPackage, itinerary: Array.from({ length: 61 }, () => ({ day: 1, title: "Day" })) }, booking, "2027-03-02").error, /60/);
});

test("package preview and atomic import enforce access, freshness, and an empty itinerary", async (t) => {
    const booking = makeBooking();
    const tourPackage = makePackage();
    const logs = [];
    let forceConflict = false;
    let updateCount = 0;

    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({
        _id: id, role: String(id) === viewerId ? "Viewer" : "Sales", status: "Active", tokenVersion: 0,
    }) }));
    t.mock.method(Booking, "findById", async (id) => String(id) === bookingId ? booking : null);
    t.mock.method(TourPackage, "findById", async (id) => String(id) === packageId ? tourPackage : null);
    t.mock.method(Booking, "findOneAndUpdate", async (query, update, options) => {
        updateCount += 1;
        assert.equal(options.runValidators, true);
        assert.equal(query["itineraryDays.0"].$exists, false);
        if (forceConflict || booking.itineraryDays.length || String(query.selectedPackage) !== String(booking.selectedPackage)
            || +query.travelStartDate !== +booking.travelStartDate || +query.travelEndDate !== +booking.travelEndDate) return null;
        booking.itineraryDays.push(...update.$push.itineraryDays.$each);
        return booking;
    });
    t.mock.method(ActivityLog, "create", async (entry) => { logs.push(entry); return entry; });

    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const root = `http://127.0.0.1:${server.address().port}/api/bookings/${bookingId}/itinerary`;
    const previewUrl = `${root}/package-preview?startDate=2027-03-02`;
    const importUrl = `${root}/import-package`;
    const request = (url, method = "GET", id = salesId, body) => fetch(url, {
        method,
        headers: id ? { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}`, "Content-Type": "application/json" } : {},
        body: body === undefined ? undefined : JSON.stringify(body),
    });

    assert.equal((await request(previewUrl, "GET", null)).status, 401);
    assert.equal((await request(previewUrl, "GET", viewerId)).status, 200);
    assert.equal((await request(importUrl, "POST", viewerId, {})).status, 403);
    assert.equal((await request(importUrl, "POST", salesId, {})).status, 400);
    assert.equal((await request(previewUrl.replace(bookingId, "bad"))).status, 400);
    assert.equal((await request(previewUrl.replace(bookingId, "507f1f77bcf86cd799439099"))).status, 404);
    assert.equal((await request(previewUrl.replace("2027-03-02", "2027-03-09"))).status, 400);

    const previewResponse = await request(previewUrl);
    assert.equal(previewResponse.status, 200);
    const preview = await previewResponse.json();
    assert.equal(preview.packageTitle, tourPackage.title);
    assert.deepEqual(preview.days.map((day) => day.date.slice(0, 10)), ["2027-03-02", "2027-03-04"]);
    assert.match(preview.previewToken, /^[a-f0-9]{64}$/);

    tourPackage.itinerary[0].description = "Changed after preview";
    assert.equal((await request(importUrl, "POST", salesId, { startDate: "2027-03-02", previewToken: preview.previewToken })).status, 409);
    tourPackage.itinerary[0].description = "  See the temple  ";
    assert.equal((await request(importUrl, "POST", salesId, { startDate: "2027-03-03", previewToken: preview.previewToken })).status, 409);
    assert.equal(updateCount, 0);

    forceConflict = true;
    assert.equal((await request(importUrl, "POST", salesId, { startDate: "2027-03-02", previewToken: preview.previewToken })).status, 409);
    forceConflict = false;
    const imported = await request(importUrl, "POST", salesId, { startDate: "2027-03-02", previewToken: preview.previewToken });
    assert.equal(imported.status, 201, await imported.clone().text());
    assert.equal((await imported.json()).importedCount, 2);
    assert.equal(booking.itineraryDays.length, 2);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].metadata.entries, 2);
    assert.equal((await request(previewUrl)).status, 409);
    assert.equal((await request(importUrl, "POST", salesId, { startDate: "2027-03-02", previewToken: preview.previewToken })).status, 409);
    assert.equal(booking.itineraryDays.length, 2);

    booking.itineraryDays.splice(0);
    booking.selectedPackage = null;
    assert.equal((await request(previewUrl)).status, 409);
    booking.selectedPackage = packageId;
    booking.bookingStatus = "Cancelled";
    assert.equal((await request(previewUrl)).status, 409);
});

test("atomic multi-day push validates the booking schema before reaching MongoDB", async (t) => {
    const collectionUpdate = t.mock.method(Booking.collection, "findOneAndUpdate", async () => null);
    await Booking.findOneAndUpdate(
        { _id: bookingId, "itineraryDays.0": { $exists: false } },
        { $push: { itineraryDays: { $each: buildPackageItineraryImport(makePackage(), makeBooking(), "2027-03-02").days } } },
        { returnDocument: "after", runValidators: true }
    );
    assert.equal(collectionUpdate.mock.callCount(), 1);
});
