const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const ActivityLog = require("../models/ActivityLog");
const { today } = require("../utils/excursions");

const main = async () => {
    if (process.env.CI_SMOKE_TESTS !== "true") throw new Error("This smoke test must be explicitly enabled in CI");
    await mongoose.connect(process.env.MONGO_URI);
    const admins = [], bookings = [];
    try {
        for (const role of ["Sales", "Viewer"]) admins.push(await Admin.create({ name: `CI Dispatch ${role}`,
            email: `ci-dispatch-${role}-${Date.now()}@example.invalid`, password: "disposable-ci-only-password", role }));
        const baseDay = today();
        const offset = (n) => { const date = new Date(baseDay); date.setUTCDate(date.getUTCDate() + n); return date.toISOString().slice(0, 10); };
        const assignment = (route, start, end, status, details = {}) => ({ route, startDate: offset(start), endDate: offset(end), status,
            pickupTime: "09:00", pickupLocation: "Hotel lobby", dropoffLocation: "Next stop", vehicleDescription: "Private van",
            registration: "XX-1234", registrationKey: "XX1234", chauffeurName: "CI Chauffeur", chauffeurPhone: "+94771234567",
            notes: "PRIVATE VEHICLE NOTE", ...details });
        const makeBooking = async (suffix, status, transportAssignments) => {
            const booking = await Booking.create({ bookingCode: `CI-DISPATCH-${Date.now()}-${suffix}`, bookingStatus: status,
                customer: { fullName: "Dispatch Guest", email: "private-guest@example.invalid", whatsappNumber: "+94771111111", country: "UK" },
                travelStartDate: offset(90), travelEndDate: offset(160), numberOfTravelers: 2, totalPrice: 800,
                transportAssignments });
            bookings.push(booking); return booking;
        };
        const open = await makeBooking("OPEN", "Confirmed", [
            assignment("Long tour", 100, 150, "Confirmed", { registration: "", registrationKey: "", chauffeurPhone: "", pickupTime: "", pickupLocation: "" }),
            assignment("Airport return", 123, 123, "Requested"),
            assignment("Hotel transfer", 125, 125, "Confirmed", { registration: "YY-3333", registrationKey: "YY3333" }),
            assignment("Cancelled leg", 125, 125, "Cancelled", { registration: "YY-3333", registrationKey: "YY3333" }),
        ]);
        const many = await makeBooking("MANY", "Pending", Array.from({ length: 21 }, (_, index) =>
            assignment(`Requested ${index}`, 124, 124, "Requested")));
        const shared = await makeBooking("SHARED", "Confirmed", [
            assignment("Other confirmed transfer", 125, 125, "Confirmed", { registration: "YY-3333", registrationKey: "YY3333" }),
            assignment("Tentative same vehicle", 125, 125, "Requested", { registration: "YY-3333", registrationKey: "YY3333" }),
            assignment("Other vehicle", 125, 125, "Confirmed", { registration: "ZZ-2222", registrationKey: "ZZ2222" }),
        ]);
        const closed = await makeBooking("CLOSED", "Cancelled", [assignment("Hidden cancelled booking", 125, 125, "Confirmed",
            { registration: "YY-3333", registrationKey: "YY3333" })]);
        const root = "http://127.0.0.1:5000/api/bookings";
        const request = (path, method = "GET", body, admin = admins[0]) => fetch(path, { method,
            headers: { Authorization: `Bearer ${jwt.sign({ id: admin._id, v: 0 }, process.env.JWT_SECRET)}`, "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body) });
        const schedule = async (filter = "all", page = 1, admin) => {
            const path = `${root}/transport-dispatch?from=${offset(120)}&to=${offset(126)}&filter=${filter}&page=${page}`;
            const response = await request(path, "GET", undefined, admin);
            assert.equal(response.status, 200, await response.clone().text());
            assert.equal(response.headers.get("cache-control"), "no-store");
            return response.json();
        };
        assert.equal((await request(`${root}/transport-dispatch?from=bad`)).status, 400);
        assert.equal((await request(`${root}/transport-dispatch?from=${offset(120)}&to=${offset(151)}`)).status, 400);
        const first = await schedule("all", 1, admins[1]), second = await schedule("all", 2);
        assert.equal(first.total, 27); assert.equal(first.totalPages, 2); assert.equal(first.items.length, 20);
        assert.equal(second.items.length, 7);
        assert.equal(new Set([...first.items, ...second.items].map((item) => item._id)).size, 27);
        assert.equal(first.items[0].route, "Long tour", "A drive starting before the range must still appear if it continues into the range");
        assert.equal(first.items.some((item) => String(item.bookingId) === String(closed._id)), false);
        assert.equal(first.items.some((item) => item.route === "Cancelled leg"), false);
        assert.deepEqual(first.summary, { total: 27, requested: 23, attention: 26,
            missingDriver: 1, missingVehicle: 1, missingPickup: 1, conflicts: 3 });
        for (const secret of ["PRIVATE VEHICLE NOTE", "private-guest@example.invalid", "totalPrice", "contacts", "advancePayment"]) {
            assert.equal(JSON.stringify(first).includes(secret), false);
        }
        assert.equal((await schedule("attention")).total, 26);
        assert.equal((await schedule("requested")).total, 23);
        assert.equal((await schedule("confirmed")).total, 4);
        const clashes = await schedule("conflicts");
        assert.equal(clashes.total, 3);
        const hotelTransfer = clashes.items.find((item) => item.route === "Hotel transfer");
        assert.deepEqual(hotelTransfer.vehicleConflicts.map((item) => item.route), ["Other confirmed transfer"]);
        const tentative = clashes.items.find((item) => item.route === "Tentative same vehicle");
        assert.deepEqual(tentative.vehicleConflicts.map((item) => item.route).sort(), ["Hotel transfer", "Other confirmed transfer"]);
        assert.equal(JSON.stringify(clashes).includes("Hidden cancelled booking"), false);
        assert.equal(JSON.stringify(clashes).includes("Cancelled leg"), false);
        assert.equal(JSON.stringify(clashes).includes("private-guest@example.invalid"), false);
        for (const filter of ["missingDriver", "missingVehicle", "missingPickup"]) {
            const result = await schedule(filter);
            assert.equal(result.total, 1); assert.equal(result.items[0].route, "Long tour");
        }
        const updated = await request(`${root}/${open._id}/transport-assignments/${open.transportAssignments[0]._id}`, "PUT", {
            registration: "AB-9876", chauffeurPhone: "+94771234567", pickupTime: "08:30", pickupLocation: "Hotel entrance",
        });
        assert.equal(updated.status, 200, await updated.clone().text());
        const fixed = await schedule("attention");
        assert.equal(fixed.total, 25); assert.equal(fixed.summary.missingDriver, 0);
        assert.equal(fixed.summary.missingVehicle, 0); assert.equal(fixed.summary.missingPickup, 0);
        assert.equal((await schedule("confirmed")).total, 4);
        await Booking.updateOne({ _id: open._id }, { $set: { bookingStatus: "Completed" } });
        assert.equal((await schedule("all")).total, 24);
        assert.equal((await schedule("conflicts")).total, 1, "Same-booking overlap stays visible after another trip closes");
        await Booking.updateOne({ _id: many._id }, { $set: { bookingStatus: "Cancelled" } });
        assert.equal((await schedule("all")).total, 3);
        await Booking.updateOne({ _id: shared._id }, { $set: { bookingStatus: "Completed" } });
        assert.equal((await schedule("all")).total, 0);
        const legacy = await makeBooking("LEGACY", "Confirmed", [assignment("Old registration", 120, 126, "Confirmed",
            { registration: "LEG-0001", registrationKey: "" })]);
        assert.equal((await schedule("missingVehicle")).total, 1, "Legacy registrations need review before conflict checks can trust them");
        const normalized = await request(`${root}/${legacy._id}/transport-assignments/${legacy.transportAssignments[0]._id}`, "PUT",
            { registration: "LEG-0001" });
        assert.equal(normalized.status, 200, await normalized.clone().text());
        assert.equal((await schedule("attention")).total, 0);
        await Booking.updateOne({ _id: legacy._id }, { $set: { bookingStatus: "Completed" } });
        assert.equal((await schedule("all")).total, 0);
        console.log("Dispatch board: vehicle clashes across trips and within a booking, tentative requests, ongoing drives, access, pagination, privacy, corrections, and closed trips passed.");
    } finally {
        const ids = bookings.map((booking) => booking._id);
        await ActivityLog.deleteMany({ relatedRecordId: { $in: ids } });
        await Booking.deleteMany({ _id: { $in: ids } });
        await Admin.deleteMany({ _id: { $in: admins.map((admin) => admin._id) } });
        await mongoose.disconnect();
    }
};
main().catch((error) => { console.error(error); process.exitCode = 1; });
