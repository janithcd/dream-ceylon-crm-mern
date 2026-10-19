const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";

const app = require("../app");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const ActivityLog = require("../models/ActivityLog");
const { parseTransportAssignment } = require("../utils/bookingTransport");

const validTransport = {
    route: "  Airport to Sigiriya  ",
    startDate: "2027-03-01",
    endDate: "2027-03-02",
    pickupTime: "09:30",
    registration: "WP CAB-1234",
    status: "Confirmed",
};

test("transport input validates dates, registrations, and status", () => {
    const parsed = parseTransportAssignment(validTransport).value;
    assert.equal(parsed.route, "Airport to Sigiriya");
    assert.equal(parsed.registrationKey, "WPCAB1234");
    assert.equal(parsed.startDate.toISOString(), "2027-03-01T00:00:00.000Z");
    assert.equal(parseTransportAssignment({ registration: "WP-CAB 1234" }, parsed).value.registrationKey, "WPCAB1234");
    for (const change of [
        { route: " " }, { route: 123 }, { registration: "--" }, { registration: null },
        { startDate: "2027-02-30" }, { endDate: "2027-02-28" },
        { pickupTime: "24:00" }, { status: "Paid" }, { notes: "x".repeat(501) },
    ]) {
        assert.ok(parseTransportAssignment({ ...validTransport, ...change }).error, JSON.stringify(change));
    }
});

test("transport can be maintained by booking editors and flags confirmed vehicle overlaps", async (t) => {
    const bookingId = "507f1f77bcf86cd799439041";
    const otherBookingId = "507f1f77bcf86cd799439042";
    const salesId = "507f1f77bcf86cd799439043";
    const viewerId = "507f1f77bcf86cd799439044";
    const booking = new Booking({
        _id: bookingId, bookingCode: "DCJ-TEST-TRANSPORT", bookingStatus: "Confirmed",
        customer: { fullName: "Tour Guest", email: "guest@example.test", whatsappNumber: "+94771234567", country: "UK" },
        travelStartDate: new Date("2027-03-01"), travelEndDate: new Date("2027-03-10"),
        numberOfTravelers: 2, totalPrice: 1000,
    });
    const other = new Booking({
        _id: otherBookingId, bookingCode: "DCJ-OTHER-TRANSPORT", bookingStatus: "Confirmed",
        customer: { fullName: "Other Guest", email: "other@example.test", whatsappNumber: "+94771234567", country: "UK" },
        travelStartDate: new Date("2027-03-02"), travelEndDate: new Date("2027-03-06"),
        numberOfTravelers: 2, totalPrice: 1000,
        transportAssignments: [parseTransportAssignment({
            route: "Day tour", startDate: "2027-03-02", endDate: "2027-03-03",
            registration: "WP-CAB 1234", status: "Confirmed",
        }).value],
    });

    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({
        _id: id, role: String(id) === viewerId ? "Viewer" : "Sales", status: "Active", tokenVersion: 0,
    }) }));
    t.mock.method(ActivityLog, "create", async () => ({}));
    t.mock.method(Booking, "exists", async () => ({ _id: bookingId }));
    t.mock.method(Booking, "findById", (id) => ({ select: async () => String(id) === bookingId ? booking : null }));
    t.mock.method(Booking, "find", (query) => ({ select: () => ({ lean: async () => {
        const filter = query.transportAssignments.$elemMatch;
        return other.transportAssignments.some((item) =>
            filter.registrationKey.$in.includes(item.registrationKey) &&
            item.startDate <= filter.startDate.$lte && item.endDate >= filter.endDate.$gte &&
            other.bookingStatus !== "Cancelled") ? [other] : [];
    } }) }));
    t.mock.method(Booking, "findOneAndUpdate", async (query, update) => {
        if (String(query._id) !== bookingId) return null;
        if (update.$push) {
            if (booking.transportAssignments.length >= 30) return null;
            booking.transportAssignments.push(update.$push.transportAssignments);
        } else {
            const item = booking.transportAssignments.id(query["transportAssignments._id"]);
            if (!item) return null;
            if (update.$set) {
                for (const [key, value] of Object.entries(update.$set)) {
                    item[key.replace("transportAssignments.$.", "")] = value;
                }
            } else if (update.$pull) {
                item.deleteOne();
            }
        }
        return booking;
    });

    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}/api/bookings/${bookingId}/transport-assignments`;
    const headers = (id) => ({ Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}`, "Content-Type": "application/json" });
    const request = (path, method, id, body) => fetch(path, {
        method, headers: id ? headers(id) : {}, body: body === undefined ? undefined : JSON.stringify(body),
    });

    assert.equal((await request(url, "GET")).status, 401);
    assert.equal((await request(url, "GET", viewerId)).status, 200);
    assert.equal((await request(url, "POST", viewerId, validTransport)).status, 403);
    assert.equal((await request(url, "POST", salesId, { ...validTransport, endDate: "2027-02-28" })).status, 400);
    assert.equal((await request(url.replace(bookingId, "invalid"), "GET", salesId)).status, 400);

    const created = await request(url, "POST", salesId, { ...validTransport, registration: "WP-CAB 1234" });
    assert.equal(created.status, 201);
    const result = await created.json();
    const assignment = result.assignments[0];
    assert.equal(assignment.route, "Airport to Sigiriya");
    assert.equal(result.conflicts[0].bookings[0].bookingCode, "DCJ-OTHER-TRANSPORT");
    assert.equal(result.conflicts[0].bookings[0].route, "Day tour");
    assert.equal("customer" in result.conflicts[0].bookings[0], false);
    assert.equal((await (await request(url, "GET", viewerId)).json()).conflicts.length, 1);

    const duplicate = await request(url, "POST", salesId, {
        route: "Second same-day trip", startDate: "2027-03-02", endDate: "2027-03-02",
        registration: "WP-CAB 1234", status: "Confirmed",
    });
    assert.equal(duplicate.status, 201);
    const duplicateBody = await duplicate.json();
    assert.ok(duplicateBody.conflicts.some((conflict) => conflict.bookings.some((match) => match.bookingCode === booking.bookingCode)));
    assert.equal((await request(`${url}/${duplicateBody.assignments[1]._id}`, "DELETE", salesId)).status, 200);

    const itemUrl = `${url}/${assignment._id}`;
    assert.equal((await request(itemUrl, "PUT", viewerId, { status: "Cancelled" })).status, 403);
    assert.equal((await request(itemUrl, "PUT", salesId, { pickupTime: "99:00" })).status, 400);
    const changed = await request(itemUrl, "PUT", salesId, { registration: "Different 999", pickupTime: "08:00" });
    assert.equal(changed.status, 200);
    assert.equal((await changed.json()).conflicts.length, 0);
    assert.equal(booking.transportAssignments[0].registrationKey, "DIFFERENT999");

    const removed = await request(itemUrl, "DELETE", salesId);
    assert.equal(removed.status, 200);
    assert.equal((await removed.json()).assignments.length, 0);
    assert.equal((await request(itemUrl, "DELETE", salesId)).status, 404);
});
