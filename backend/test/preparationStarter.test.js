const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
process.env.AUTH_RATE_LIMIT_MAX = "1000";

const app = require("../app");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const ActivityLog = require("../models/ActivityLog");
const { starterOptions } = require("../utils/preparationStarter");

test("starter dates follow Colombo today and skip manually entered task titles", () => {
    const booking = {
        travelStartDate: new Date("2027-03-01T00:00:00.000Z"),
        preparationTasks: [{ title: " confirm GUIDE " }],
    };
    const now = new Date("2027-02-13T19:00:00.000Z"); // Feb 14 in Colombo.
    const options = starterOptions(booking, now);
    assert.equal(options.find((item) => item.key === "accommodation").dueDate, "2027-02-14");
    assert.equal(options.find((item) => item.key === "transport").dueDate, "2027-02-15");
    assert.equal(options.find((item) => item.key === "itinerary").dueDate, "2027-02-26");
    assert.equal(options.find((item) => item.key === "guide").alreadyAdded, true);
    assert.equal(starterOptions({ travelStartDate: new Date("2028-03-01"), preparationTasks: [] }, new Date("2028-02-01"))
        .find((item) => item.key === "itinerary").dueDate, "2028-02-27");
});

test("starter preview and bulk add enforce permissions, duplicates, capacity, and trip state", async (t) => {
    const bookingId = "507f1f77bcf86cd799439021";
    const salesId = "507f1f77bcf86cd799439022";
    const viewerId = "507f1f77bcf86cd799439023";
    const booking = new Booking({
        _id: bookingId, bookingCode: "DCJ-STARTER-1",
        customer: { fullName: "Guest", email: "guest@example.test", whatsappNumber: "+94771234567", country: "UK" },
        travelStartDate: new Date("2027-03-01"), travelEndDate: new Date("2027-03-08"),
        numberOfTravelers: 2, totalPrice: 1000,
    });
    t.mock.method(booking, "populate", async () => booking);
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({
        _id: id, role: String(id) === viewerId ? "Viewer" : "Sales", status: "Active", tokenVersion: 0,
    }) }));
    t.mock.method(Booking, "findById", () => ({ select: async () => booking }));
    t.mock.method(Booking, "findOneAndUpdate", async (query, update) => {
        if (!query.bookingStatus.$in.includes(booking.bookingStatus) ||
            query.travelStartDate.getTime() !== booking.travelStartDate.getTime() ||
            booking.preparationTasks.length > query.$expr.$lte[1] ||
            query.$nor.some((condition) => booking.preparationTasks.some((task) =>
                new RegExp(condition["preparationTasks.title"].$regex, "i").test(task.title)))) return null;
        booking.preparationTasks.push(...update.$push.preparationTasks.$each);
        return booking;
    });
    t.mock.method(ActivityLog, "create", async () => ({}));

    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}/api/bookings/${bookingId}/preparation-starter`;
    const request = (method, id, body) => fetch(base, {
        method,
        headers: { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = (keys, includeDueDates = true) => ({ keys, includeDueDates, departureDate: "2027-03-01" });

    assert.equal((await fetch(base)).status, 401);
    assert.equal((await request("GET", viewerId)).status, 200);
    assert.equal((await request("POST", viewerId, payload(["guide"]))).status, 403);
    assert.equal((await request("POST", salesId, payload([]))).status, 400);
    assert.equal((await request("POST", salesId, payload(["guide", "guide"]))).status, 400);
    assert.equal((await request("POST", salesId, payload(["unknown"]))).status, 400);
    assert.equal((await request("POST", salesId, { ...payload(["guide"]), departureDate: "2027-02-28" })).status, 409);

    const preview = await (await request("GET", salesId)).json();
    assert.equal(preview.departureDate, "2027-03-01");
    assert.equal(preview.options.length, 4);
    const created = await request("POST", salesId, payload(["accommodation", "guide"]));
    assert.equal(created.status, 201);
    assert.equal((await created.json()).addedCount, 2);
    assert.deepEqual(booking.preparationTasks.map((task) => task.title), ["Confirm accommodation", "Confirm guide"]);
    assert.equal(booking.preparationTasks[0].assignedTo, null);
    assert.equal((await request("POST", salesId, payload(["guide"]))).status, 409);
    assert.equal((await (await request("GET", viewerId)).json()).options.filter((item) => item.alreadyAdded).length, 2);
    assert.equal((await request("POST", salesId, payload(["itinerary"], false))).status, 201);
    assert.equal(booking.preparationTasks[2].dueDate, null);

    booking.preparationTasks.push({ title: "Arrange vehicle and chauffeur" });
    assert.equal((await request("POST", salesId, payload(["transport"]))).status, 409);
    booking.preparationTasks.pop();
    booking.bookingStatus = "Cancelled";
    assert.equal((await request("POST", salesId, payload(["transport"]))).status, 409);
    booking.bookingStatus = "Pending";
    for (let index = booking.preparationTasks.length; index < 30; index += 1) {
        booking.preparationTasks.push({ title: `Other ${index}` });
    }
    assert.equal((await request("POST", salesId, payload(["transport"]))).status, 409);
});
