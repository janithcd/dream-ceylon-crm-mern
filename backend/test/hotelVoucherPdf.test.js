const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { PDFDocument } = require("pdf-lib");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
const app = require("../app");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const CompanySetting = require("../models/CompanySetting");
const ActivityLog = require("../models/ActivityLog");
const { buildHotelVoucher } = require("../utils/hotelVoucher");
const { createHotelVoucherPdf } = require("../controllers/hotelVoucherPdfController");

const exampleBooking = () => new Booking({
    _id: "507f1f77bcf86cd799439091", bookingCode: "DCJ-VOUCHER-TEST", bookingStatus: "Confirmed",
    customer: { fullName: "José සිංහල தமிழ் Жанна", email: "private@example.invalid", whatsappNumber: "+94770000000", country: "UK" },
    numberOfTravelers: 8, totalPrice: 54321, advancePayment: 12345,
    adminNotes: "PRIVATE ADMIN NOTE", specialRequests: "PRIVATE SPECIAL REQUEST",
    hotelStays: [
        { _id: "507f1f77bcf86cd799439092", hotelName: "Sample Lagoon Hotel", location: "Negombo",
            checkInDate: new Date("2027-03-01"), checkOutDate: new Date("2027-03-03"), rooms: 1,
            roomType: "Superior double", mealPlan: "Bed & Breakfast", status: "Confirmed",
            confirmationNumber: "HOTEL-REF-456", supplierEmail: "supplier-private@hotel.example", notes: "PRIVATE SUPPLIER NOTE" },
        { hotelName: "PRIVATE OTHER HOTEL", checkInDate: new Date("2027-03-03"), checkOutDate: new Date("2027-03-04") },
    ],
});
const company = { companyName: "Dream Ceylon Journeys", email: "info@dreamceylonjourneys.com", whatsapp: "+94775124645" };

const readPdf = async (bytes) => {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({ data: new Uint8Array(bytes), disableFontFace: true, useSystemFonts: false });
    try {
        const document = await task.promise;
        const pages = [];
        for (let number = 1; number <= document.numPages; number += 1) {
            const content = await (await document.getPage(number)).getTextContent();
            pages.push(content.items.map(({ str }) => str).join(" "));
        }
        return pages.join(" ");
    } finally {
        await task.destroy();
    }
};

test("hotel voucher selects one confirmed stay, counts Sri Lanka nights and excludes private details", async () => {
    const booking = exampleBooking();
    const stay = booking.hotelStays[0];
    const voucher = buildHotelVoucher(booking, stay, new Date("2027-02-28T18:30:00Z")).value;
    assert.equal(voucher.nights, 2);
    assert.equal(voucher.rooms, 1);
    assert.equal(voucher.numberOfTravelers, undefined, "Do not imply the entire booking group occupies this stay");
    const bytes = await createHotelVoucherPdf(voucher, company);
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
    const printed = await readPdf(bytes);
    for (const expected of ["HOTEL VOUCHER", "CONFIRMED RESERVATION", "Sample Lagoon Hotel", "HOTEL-REF-456", "Superior double", "Bed & Breakfast", "Mar 1, 2027", "Mar 3, 2027", "info@dreamceylonjourneys.com", "not a payment receipt"]) {
        assert.ok(printed.includes(expected), expected);
    }
    const searchable = printed.replace(/\s+/gu, "");
    for (const name of ["José", "සිංහල", "தமிழ்", "Жанна"]) assert.ok(searchable.includes(name), name);
    for (const privateValue of ["PRIVATE", "54321", "12345", "private@example.invalid", "supplier-private@hotel.example", "+94770000000"]) {
        assert.equal(JSON.stringify(voucher).includes(privateValue), false, privateValue);
        assert.equal(printed.includes(privateValue), false, privateValue);
    }
    // Two different instants on consecutive Sri Lanka calendar dates are one night.
    stay.checkInDate = new Date("2027-03-01T18:29:00Z");
    stay.checkOutDate = new Date("2027-03-01T18:31:00Z");
    assert.equal(buildHotelVoucher(booking, stay).value.nights, 1);
});

test("hotel voucher rejects cancelled/unconfirmed work and invalid stay details", () => {
    const booking = exampleBooking();
    const stay = booking.hotelStays[0];
    for (const status of ["Requested", "Cancelled"]) {
        stay.status = status;
        assert.match(buildHotelVoucher(booking, stay).error, /Confirm this hotel stay/);
    }
    stay.status = "Confirmed";
    booking.bookingStatus = "Cancelled";
    assert.match(buildHotelVoucher(booking, stay).error, /Cancelled bookings/);
    for (const status of ["Pending", "Confirmed", "In Progress", "Completed"]) {
        booking.bookingStatus = status;
        assert.ok(buildHotelVoucher(booking, stay).value, "A confirmed hotel stay may be printed independently of the tour status");
    }
    for (const changes of [
        { checkOutDate: stay.checkInDate }, { checkInDate: null }, { checkOutDate: "bad" },
        { hotelName: " " }, { rooms: 0 }, { rooms: 1.5 },
    ]) assert.ok(buildHotelVoucher(booking, { ...stay.toObject(), ...changes }).error);
});

test("voucher wraps long names/references across pages and handles missing optional details", async () => {
    const booking = exampleBooking();
    booking.customer.fullName = "Long guest name ".repeat(100) + "FINAL GUEST";
    const stay = booking.hotelStays[0];
    stay.hotelName = "Long hotel name ".repeat(7);
    stay.roomType = "";
    stay.confirmationNumber = "REF".repeat(32);
    const bytes = await createHotelVoucherPdf(buildHotelVoucher(booking, stay).value, {
        ...company, logoPath: __filename, website: "https://www.dreamceylonjourneys.com",
    });
    assert.ok((await PDFDocument.load(bytes)).getPageCount() > 1);
    const printed = await readPdf(bytes);
    assert.match(printed, /FINAL GUEST/);
    assert.match(printed, /Not supplied/);
    assert.match(printed, /BOOKING ASSISTANCE/);
    assert.match(printed, /info@dreamceylonjourneys.com/);
});

test("voucher endpoint checks both permissions, stay ownership and current confirmation, then logs downloads", async (t) => {
    const booking = exampleBooking();
    const stay = booking.hotelStays[0];
    const salesId = "507f1f77bcf86cd799439093";
    const viewerId = "507f1f77bcf86cd799439094";
    const pdfOnlyId = "507f1f77bcf86cd799439095";
    const logs = [];
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({
        _id: id, role: String(id) === viewerId ? "Viewer" : String(id) === pdfOnlyId ? "Unknown Role" : "Sales",
        customPermissions: String(id) === pdfOnlyId ? ["pdf.generate"] : [], status: "Active", tokenVersion: 0,
    }) }));
    t.mock.method(Booking, "findById", async (id) => String(id) === String(booking._id) ? booking : null);
    t.mock.method(CompanySetting, "findOne", async () => null);
    t.mock.method(ActivityLog, "create", async (entry) => { logs.push(entry); return entry; });
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const endpoint = `http://127.0.0.1:${server.address().port}/api/booking-pdf/hotel-voucher/${booking._id}/${stay._id}`;
    const request = (url = endpoint, id = salesId) => fetch(url, {
        method: "POST", headers: id ? { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` } : {},
    });
    assert.equal((await request(endpoint, null)).status, 401);
    assert.equal((await request(endpoint, viewerId)).status, 403);
    assert.equal((await request(endpoint, pdfOnlyId)).status, 403);
    assert.equal((await request(endpoint.replace(String(booking._id), "bad"))).status, 400);
    assert.equal((await request(endpoint.replace(String(stay._id), "bad"))).status, 400);
    assert.equal((await request(endpoint.replace(String(booking._id), "507f1f77bcf86cd799439099"))).status, 404);
    assert.equal((await request(endpoint.replace(String(stay._id), String(booking.hotelStays[1]._id)))).status, 409);
    assert.equal((await request(endpoint.replace(String(stay._id), "507f1f77bcf86cd799439099"))).status, 404);
    stay.status = "Cancelled";
    assert.equal((await request()).status, 409);
    stay.status = "Confirmed";
    booking.bookingStatus = "Cancelled";
    assert.equal((await request()).status, 409);
    assert.equal(logs.length, 0);
    booking.bookingStatus = "Confirmed";
    const response = await request();
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /application\/pdf/);
    assert.match(response.headers.get("content-disposition"), /dream-ceylon-hotel-voucher-DCJ-VOUCHER-TEST/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(await readPdf(await response.arrayBuffer()), /HOTEL-REF-456/);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].metadata.documentType, "Hotel Voucher");
    assert.equal(logs[0].metadata.stayId, String(stay._id));
    assert.equal(String(logs[0].relatedRecordId), String(booking._id));
});
