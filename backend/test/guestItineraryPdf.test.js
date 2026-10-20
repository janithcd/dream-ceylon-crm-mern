const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { PDFDocument } = require("pdf-lib");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";

const app = require("../app");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const ActivityLog = require("../models/ActivityLog");
const CompanySetting = require("../models/CompanySetting");
const { buildGuestItinerary } = require("../utils/guestItinerary");
const { createGuestItineraryPdf } = require("../controllers/guestItineraryPdfController");

const exampleBooking = () => new Booking({
    _id: "507f1f77bcf86cd799439061",
    bookingCode: "DCJ-TEST-GUEST",
    bookingStatus: "Confirmed",
    customer: { fullName: "José සිංහල தமிழ் Жанна", email: "private-guest@example.test", whatsappNumber: "+94771234567", country: "UK" },
    travelStartDate: new Date("2027-03-01"), travelEndDate: new Date("2027-03-10"),
    numberOfTravelers: 2, totalPrice: 54321, advancePayment: 12345,
    adminNotes: "PRIVATE ADMIN NOTE", specialRequests: "PRIVATE REQUEST",
    hotelStays: [{ hotelName: "PRIVATE HOTEL", checkInDate: new Date("2027-03-01"), checkOutDate: new Date("2027-03-02"), notes: "PRIVATE SUPPLIER NOTE" }],
    transportAssignments: [{ route: "PRIVATE TRANSPORT", registration: "PRIVATE VEHICLE" }],
    preparationTasks: [{ title: "PRIVATE TASK" }],
    itineraryDays: [
        { date: new Date("2027-03-03"), title: "Sigiriya", plan: "Climb the rock", overnightLocation: "Habarana" },
        { date: new Date("2027-03-01"), title: "Arrival", plan: "Meet at airport" },
    ],
});

const readPdfText = async (bytes) => {
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

test("guest itinerary selects only guest-facing fields and prints them in travel order", async () => {
    const booking = exampleBooking();
    const itinerary = buildGuestItinerary(booking);
    assert.deepEqual(itinerary.entries.map((day) => day.title), ["Arrival", "Sigiriya"]);
    assert.equal(itinerary.isDraft, false);
    for (const sensitive of ["54321", "12345", "PRIVATE", "private-guest@example.test", "+94771234567"]) {
        assert.equal(JSON.stringify(itinerary).includes(sensitive), false, sensitive);
    }

    const bytes = await createGuestItineraryPdf(itinerary, {
        companyName: "Dream Ceylon Journeys", whatsapp: "+94775124645", email: "info@dreamceylonjourneys.com",
    });
    assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), "%PDF-");
    const printed = await readPdfText(bytes);
    assert.match(printed, /YOUR SRI LANKA ITINERARY/);
    assert.match(printed, /Meet at airport/);
    assert.match(printed, /Overnight: Habarana/);
    assert.match(printed, /info@dreamceylonjourneys.com/);
    const searchable = printed.replace(/\s+/gu, "");
    for (const name of ["José", "සිංහල", "தமிழ்", "Жанна"]) {
        assert.ok(searchable.includes(name), `Guest name ${name} should remain searchable`);
    }
    for (const sensitive of ["54321", "12345", "PRIVATE", "private-guest@example.test", "+94771234567"]) {
        assert.equal(printed.includes(sensitive), false, sensitive);
    }
});

test("guest itinerary PDF flows onto additional pages for longer trips", async () => {
    const booking = exampleBooking();
    for (let day = 2; day < 10; day += 1) {
        booking.itineraryDays.push({
            date: new Date(`2027-03-${String(day).padStart(2, "0")}`),
            title: `Stop ${day}`,
            plan: `Morning walk and afternoon sightseeing at stop ${day}. `.repeat(10),
            overnightLocation: "Colombo",
        });
    }
    const bytes = await createGuestItineraryPdf(buildGuestItinerary(booking), { companyName: "Dream Ceylon Journeys" });
    assert.ok((await PDFDocument.load(bytes)).getPageCount() > 1);
    const printed = await readPdfText(bytes);
    assert.match(printed, /Stop 9/);
    assert.match(printed, /Overnight: Colombo/);
});

test("guest PDF requires booking and PDF permissions, a live booking, and saved itinerary entries", async (t) => {
    const booking = exampleBooking();
    const salesId = "507f1f77bcf86cd799439062";
    const viewerId = "507f1f77bcf86cd799439063";
    const logs = [];

    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({
        _id: id, role: String(id) === viewerId ? "Viewer" : "Sales", status: "Active", tokenVersion: 0,
    }) }));
    t.mock.method(Booking, "findById", async (id) => String(id) === String(booking._id) ? booking : null);
    t.mock.method(CompanySetting, "findOne", async () => null);
    t.mock.method(ActivityLog, "create", async (entry) => { logs.push(entry); return entry; });

    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const endpoint = `http://127.0.0.1:${server.address().port}/api/booking-pdf/guest-itinerary/${booking._id}`;
    const request = (url, id) => fetch(url, {
        method: "POST", headers: id ? { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` } : {},
    });

    assert.equal((await request(endpoint)).status, 401);
    assert.equal((await request(endpoint, viewerId)).status, 403);
    assert.equal((await request(endpoint.replace(String(booking._id), "bad"), salesId)).status, 400);
    assert.equal((await request(endpoint.replace(String(booking._id), "507f1f77bcf86cd799439099"), salesId)).status, 404);

    const savedDays = [...booking.itineraryDays];
    booking.itineraryDays = [];
    const missingDays = await request(endpoint, salesId);
    assert.equal(missingDays.status, 409);
    assert.match((await missingDays.json()).message, /Add itinerary entries/);
    booking.itineraryDays = savedDays;
    booking.bookingStatus = "Cancelled";
    assert.equal((await request(endpoint, salesId)).status, 409);
    booking.bookingStatus = "Pending";

    const response = await request(endpoint, salesId);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /application\/pdf/);
    assert.match(response.headers.get("content-disposition"), /dream-ceylon-guest-itinerary-DCJ-TEST-GUEST\.pdf/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(await readPdfText(await response.arrayBuffer()), /Draft itinerary/);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].metadata.documentType, "Guest Itinerary");
});
