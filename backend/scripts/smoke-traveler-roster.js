const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const ActivityLog = require("../models/ActivityLog");

const main = async () => {
    if (process.env.CI_SMOKE_TESTS !== "true") throw new Error("This smoke test must be explicitly enabled in CI");
    await mongoose.connect(process.env.MONGO_URI);
    const admins = [];
    let booking;
    try {
        for (const role of ["Sales", "Viewer"]) {
            admins.push(await Admin.create({ name: `CI Roster ${role}`,
                email: `ci-roster-${role}-${Date.now()}@example.invalid`,
                password: "disposable-ci-only-password", role }));
        }
        booking = await Booking.create({ bookingCode: `CI-ROSTER-${Date.now()}`,
            customer: { fullName: "Booking Contact", email: "roster@example.invalid",
                whatsappNumber: "+94771234567", country: "UK" },
            travelStartDate: new Date("2027-04-01"), travelEndDate: new Date("2027-04-05"),
            numberOfTravelers: 2, totalPrice: 600,
            hotelStays: [{ hotelName: "CI Hotel", checkInDate: new Date("2027-04-01"),
                checkOutDate: new Date("2027-04-02"), rooms: 1, status: "Confirmed",
                supplierEmail: "reservations@example.invalid", confirmationNumber: "CI-REF" }],
        });
        // Existing bookings do not have the roster version field.
        await Booking.collection.updateOne({ _id: booking._id }, { $unset: { travelerRosterVersion: "" } });
        const url = `http://127.0.0.1:5000/api/bookings/${booking._id}`;
        const request = (admin, path, method = "GET", body) => fetch(path, {
            method, headers: { Authorization: `Bearer ${jwt.sign({ id: admin._id, v: 0 }, process.env.JWT_SECRET)}`,
                "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const viewer = admins[1];
        const sales = admins[0];
        const roomingUrl = `${url}/hotel-stays/${booking.hotelStays[0]._id}/rooming-details`;
        assert.equal((await request(sales, roomingUrl)).status, 409);
        const read = await request(viewer, `${url}/travelers`);
        assert.equal(read.status, 200, await read.clone().text());
        assert.equal(read.headers.get("cache-control"), "no-store");
        assert.equal((await read.json()).version, 0);
        assert.equal((await request(viewer, `${url}/travelers`, "PUT", {
            expectedVersion: 0, expectedHeadcount: 2, travelerNames: ["First Traveler"],
        })).status, 403);
        const saved = await request(sales, `${url}/travelers`, "PUT", {
            expectedVersion: 0, expectedHeadcount: 2, travelerNames: ["  First Traveler  ", "Second Traveler"],
        });
        assert.equal(saved.status, 200, await saved.clone().text());
        assert.equal((await saved.json()).version, 1);
        assert.deepEqual(Array.from((await Booking.findById(booking._id)).travelerNames), ["First Traveler", "Second Traveler"]);
        assert.equal((await request(viewer, roomingUrl)).status, 403);
        const rooming = await request(sales, roomingUrl);
        assert.equal(rooming.status, 200, await rooming.clone().text());
        assert.equal(rooming.headers.get("cache-control"), "no-store");
        const roomingDetails = await rooming.json();
        assert.deepEqual(roomingDetails.travelerNames, ["First Traveler", "Second Traveler"]);
        assert.equal(roomingDetails.recipient, "reservations@example.invalid");
        assert.ok(!JSON.stringify(roomingDetails).includes("roster@example.invalid"));
        assert.ok(!JSON.stringify(roomingDetails).includes("600"));
        assert.equal((await request(sales, `${url}/travelers`, "PUT", {
            expectedVersion: 0, expectedHeadcount: 2, travelerNames: [],
        })).status, 409);
        assert.equal((await request(sales, url, "PUT", { numberOfTravelers: 1 })).status, 400);
        assert.deepEqual(Array.from((await Booking.findById(booking._id)).travelerNames), ["First Traveler", "Second Traveler"]);
        const audit = await ActivityLog.findOne({ relatedRecordId: booking._id, description: /Traveler roster updated/ });
        assert.equal(audit?.metadata.namedTravelerCount, 2);
        assert.equal(JSON.stringify(audit).includes("First Traveler"), false);
        console.log("Traveler roster persists on legacy bookings and supplies permissioned hotel rooming details.");
    } finally {
        if (booking) {
            await ActivityLog.deleteMany({ relatedRecordId: booking._id });
            await Booking.deleteOne({ _id: booking._id });
        }
        if (admins.length) await Admin.deleteMany({ _id: { $in: admins.map((admin) => admin._id) } });
        await mongoose.disconnect();
    }
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
