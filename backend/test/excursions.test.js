const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
process.env.AUTH_RATE_LIMIT_MAX = "1000";
const app = require("../app");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const ActivityLog = require("../models/ActivityLog");
const { parseExcursion, transitionExcursion, buildExcursionMessage, excursionsFitBooking, today } = require("../utils/excursions");
const { parseExcursionSchedule } = require("../utils/excursionSchedule");
const sales = "507f1f77bcf86cd799439082", viewer = "507f1f77bcf86cd799439083";
const makeBooking = () => new Booking({ _id: "507f1f77bcf86cd799439081", bookingCode: "DCJ-ACTIVITY-TEST",
    customer: { fullName: "Test Guest", email: "private@example.test", whatsappNumber: "+94771234567", country: "UK" },
    travelStartDate: new Date("2027-03-01"), travelEndDate: new Date("2027-03-10"), numberOfTravelers: 2, totalPrice: 1000, bookingStatus: "Confirmed" });
const form = () => ({ title: "Yala morning safari", type: "Safari", date: "2027-03-05", startTime: "05:30", participants: 2,
    supplierName: "Test Jeeps", supplierEmail: "SAFARI@example.test", supplierPhone: "+94771234567", meetingPoint: "Hotel lobby",
    guestInstructions: "Bring a hat", internalNotes: "Private negotiated discount", followUpDate: "2027-03-03" });

test("activity validation respects trip dates, headcount, field limits and explicit fields", async () => {
    const booking = makeBooking();
    const parsed = parseExcursion({ ...form(), status: "Confirmed", confirmationReference: "injected", history: [{ action: "spoof" }] }, booking);
    assert.equal(parsed.value.supplierEmail, "safari@example.test");
    for (const key of ["status", "confirmationReference", "history"]) assert.equal(parsed.value[key], undefined);
    for (const bad of [{ date: "2027-02-30" }, { date: "2027-03-11" }, { date: "2027-02-28" }, { participants: 3 }, { participants: 0 },
        { participants: 1.5 }, { participants: true }, { startTime: "24:00" }, { startTime: "5:30" }, { supplierEmail: "a@b.test,b@c.test" },
        { title: "" }, { type: "Unknown" }, { internalNotes: "a\nb" }, { title: "x\u202ey" }, { followUpDate: "2027-03-06" }, { supplierName: "x".repeat(161) }]) {
        assert.ok(parseExcursion({ ...form(), ...bad }, booking).error, JSON.stringify(bad));
    }
    booking.excursions.push(parsed.value);
    await booking.validate();
    booking.numberOfTravelers = 1;
    await assert.rejects(booking.validate(), /traveler count/);
    booking.excursions[0].status = "Cancelled";
    await booking.validate();
    assert.equal(excursionsFitBooking([], {}), true);
});

test("activity transitions require actual actions, supplier confirmation and safe cancellation", () => {
    const booking = makeBooking(), item = { ...parseExcursion(form(), booking).value, status: "Planned" };
    const move = (status, extra = {}) => transitionExcursion(item, { status, confirmed: true, ...extra }, booking, new Date("2027-03-04"));
    assert.ok(move("Confirmed", { confirmationReference: "REF" }).error);
    assert.ok(move("Requested", { confirmed: false }).error);
    assert.equal(move("Requested").value.status, "Requested");
    item.status = "Requested";
    assert.ok(move("Confirmed").error);
    assert.equal(move("Confirmed", { confirmationReference: "REF" }).value.followUpDate, null);
    assert.ok(move("Cancelled", { note: "Supplier acknowledged" }).error);
    assert.ok(move("Cancellation requested").error);
    assert.equal(move("Cancellation requested", { note: "Guest changed plans" }).value.status, "Cancellation requested");
    item.status = "Confirmed";
    assert.ok(move("Completed").error);
    assert.equal(transitionExcursion(item, { status: "Completed", confirmed: true }, booking, new Date("2027-03-05")).value.status, "Completed");
    booking.bookingStatus = "Cancelled";
    assert.ok(move("Completed").error);
    assert.equal(move("Cancellation requested", { note: "Booking cancelled" }).value.status, "Cancellation requested");
    item.status = "Cancelled";
    booking.bookingStatus = "Confirmed";
    booking.numberOfTravelers = 1;
    assert.ok(move("Planned", { note: "Guest requested again" }).error);
});

test("drafts exclude internal notes and financial/customer data; cancellation can be drafted before sending", () => {
    const booking = makeBooking(), item = { ...parseExcursion(form(), booking).value, status: "Requested", confirmationReference: "" };
    assert.ok(buildExcursionMessage(item, booking, "guest").error);
    const cancellation = buildExcursionMessage(item, booking, "cancellation").value;
    assert.match(cancellation.body, /Please cancel/);
    assert.equal(cancellation.recipient, "safari@example.test");
    assert.equal(item.status, "Requested");
    const supplier = buildExcursionMessage(item, booking, "supplier").value;
    assert.match(supplier.body, /confirmation reference/);
    item.status = "Confirmed"; item.confirmationReference = "SAF-123";
    const guest = buildExcursionMessage(item, booking, "guest").value;
    assert.match(guest.body, /Bring a hat/); assert.match(guest.body, /SAF-123/);
    for (const draft of [supplier, guest, cancellation]) {
        for (const secret of [item.internalNotes, "1000", "private@example.test"]) assert.equal(JSON.stringify(draft).includes(secret), false);
    }
    booking.bookingStatus = "Cancelled";
    assert.ok(buildExcursionMessage(item, booking, "guest").error);
    assert.ok(buildExcursionMessage(item, booking, "supplier").error);
    assert.ok(buildExcursionMessage(item, booking, "cancellation").value);
});

test("schedule validates a bounded date range and uses the Colombo calendar day", () => {
    assert.equal(today(new Date("2026-11-08T19:00:00Z")), "2026-11-09");
    assert.equal(parseExcursionSchedule({}, new Date("2026-11-08T19:00:00Z")).value.from, "2026-11-09");
    assert.ok(parseExcursionSchedule({ from: "2027-01-01", to: "2027-01-31" }).value);
    for (const query of [{ from: "2027-02-30" }, { from: "2027-01-01", to: "2027-02-01" }, { status: { $ne: "" } },
        { attention: "secret" }, { page: "0" }, { page: "1001" }, { page: "1.5" }, { from: "2027-03-01", to: "2027-02-28" }]) assert.ok(parseExcursionSchedule(query).error);
});

test("activity API enforces permissions, scoping, conflicts, reconfirmation and audit privacy", async (t) => {
    let stored = makeBooking(), race = false;
    const logs = [];
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({ _id: id, name: "Test Staff", role: String(id) === viewer ? "Viewer" : "Sales", status: "Active", tokenVersion: 0 }) }));
    // Return independent snapshots so failed writes cannot mutate the database fixture.
    t.mock.method(Booking, "findById", (id) => ({ select: async () => String(id) === String(stored._id) ? new Booking(stored.toObject()) : null }));
    t.mock.method(Booking, "findOneAndUpdate", (query, update) => ({ select: async () => {
        assert.equal(query.numberOfTravelers, stored.numberOfTravelers);
        assert.equal(query.bookingStatus, stored.bookingStatus);
        assert.equal(+query.travelStartDate, +stored.travelStartDate);
        if (race) { race = false; return null; }
        stored.excursions = update.$set.excursions;
        stored.excursionsRevision += update.$inc.excursionsRevision;
        await stored.validate();
        return new Booking(stored.toObject());
    } }));
    t.mock.method(ActivityLog, "create", async (log) => { logs.push(log); return log; });
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}/api/bookings/${stored._id}/excursions`;
    const request = (path = "", method = "GET", body, id = sales) => fetch(`${base}${path}`, { method,
        headers: { ...(id ? { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` } : {}), "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body) });
    assert.equal((await request("", "GET", undefined, null)).status, 401);
    const read = await request("", "GET", undefined, viewer);
    assert.equal(read.status, 200); assert.equal(read.headers.get("cache-control"), "no-store");
    assert.equal((await read.json()).version, 0);
    assert.equal((await request("", "POST", { ...form(), expectedVersion: 0 }, viewer)).status, 403);
    assert.equal((await request("", "POST", form())).status, 400);
    const created = await request("", "POST", { ...form(), expectedVersion: 0, status: "Confirmed" });
    assert.equal(created.status, 201, await created.clone().text());
    const item = (await created.json()).items[0];
    assert.equal(item.status, "Planned");
    assert.equal((await request("", "POST", { ...form(), expectedVersion: 0 })).status, 409);
    assert.equal((await request("/507f1f77bcf86cd799439099", "PUT", { ...form(), expectedVersion: 1 })).status, 404);
    const statusPath = `/${item._id}/status`;
    const move = (status, extra = {}) => request(statusPath, "PATCH", { status, confirmed: true, expectedVersion: stored.excursionsRevision, ...extra });
    assert.equal((await move("Requested")).status, 200);
    assert.equal((await move("Confirmed", { confirmationReference: "SAF-123" })).status, 200);
    const message = await request(`/${item._id}/message?audience=guest`);
    assert.equal(message.status, 200); assert.equal((await message.json()).body.includes("Private negotiated discount"), false);
    assert.equal((await request(`/${item._id}/message?audience=guest`, "GET", undefined, viewer)).status, 403);
    race = true;
    assert.equal((await request(`/${item._id}`, "PUT", { ...form(), startTime: "06:00", expectedVersion: stored.excursionsRevision })).status, 409);
    assert.equal(stored.excursions[0].status, "Confirmed");
    assert.equal((await request(`/${item._id}`, "PUT", { ...form(), startTime: "06:00", expectedVersion: stored.excursionsRevision })).status, 200);
    assert.equal(stored.excursions[0].status, "Requested"); assert.equal(stored.excursions[0].confirmationReference, "");
    assert.equal((await move("Cancellation requested", { note: "Guest request" })).status, 200);
    assert.equal((await request(`/${item._id}`, "PUT", { ...form(), expectedVersion: stored.excursionsRevision })).status, 409);
    assert.equal((await move("Cancelled", { note: "Supplier acknowledged, no fee" })).status, 200);
    assert.equal(stored.excursions[0].history.length, 6);
    assert.equal(JSON.stringify(logs).includes("Private negotiated discount"), false);
    assert.equal(JSON.stringify(logs).includes("safari@example.test"), false);
});
