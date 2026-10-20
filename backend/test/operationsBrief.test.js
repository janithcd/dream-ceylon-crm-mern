const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { PDFDocument } = require("pdf-lib");

process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";

const app = require("../app");
const Booking = require("../models/Booking");
const Admin = require("../models/Admin");
const ActivityLog = require("../models/ActivityLog");
const CompanySetting = require("../models/CompanySetting");
const { buildOperationsBrief } = require("../utils/operationsBrief");
const { cleanPdfText } = require("../utils/briefPdfText");
const { createOperationsBriefPdf } = require("../controllers/bookingBriefPdfController");

const exampleBooking = () => new Booking({
    bookingCode: "DCJ-TEST-BRIEF",
    bookingStatus: "Confirmed",
    customer: { fullName: "José Tour Guest", email: "guest@example.test", whatsappNumber: "+94771234567", country: "UK" },
    travelStartDate: new Date("2027-03-01"), travelEndDate: new Date("2027-03-10"),
    numberOfTravelers: 2, totalPrice: 1000, advancePayment: 500, paymentStatus: "Partially Paid",
    adminNotes: "PRIVATE ADMIN NOTE",
    specialRequests: "PRIVATE REQUEST",
    hotelStays: [
        { hotelName: "Hotel A", checkInDate: new Date("2027-03-01"), checkOutDate: new Date("2027-03-03"), rooms: 1, status: "Confirmed", confirmationNumber: "HV-123", notes: "PRIVATE HOTEL NOTE" },
        { hotelName: "Cancelled Hotel", checkInDate: new Date("2027-03-04"), checkOutDate: new Date("2027-03-06"), rooms: 1, status: "Cancelled" },
    ],
    transportAssignments: [
        { route: "Airport → Sigiriya", startDate: new Date("2027-03-01"), endDate: new Date("2027-03-03"), vehicleDescription: "KDH Hiace", registration: "WP CAB-1234", chauffeurName: "Chauffeur", chauffeurPhone: "+94771111111", status: "Confirmed", notes: "PRIVATE TRANSPORT NOTE" },
        { route: "Cancelled ride", startDate: new Date("2027-03-04"), endDate: new Date("2027-03-04"), status: "Cancelled" },
    ],
    preparationTasks: [
        { title: "Confirm guide", dueDate: new Date("2027-02-27"), priority: "High", notes: "PRIVATE TASK NOTE" },
        { title: "Completed task", completedAt: new Date("2027-02-20") },
    ],
});

test("departure brief selects operational details without prices or private notes", () => {
    const brief = buildOperationsBrief(exampleBooking());
    assert.equal(brief.sections[0].items.length, 1);
    assert.equal(brief.sections[1].items.length, 1);
    assert.equal(brief.sections[2].items.length, 1);
    assert.match(JSON.stringify(brief), /HV-123/);
    assert.match(JSON.stringify(brief), /Confirm guide/);
    assert.match(JSON.stringify(brief), /KDH Hiace/);
    for (const privateValue of ["1000", "500", "PRIVATE", "Cancelled Hotel", "Cancelled ride", "Completed task", "guest@example.test"]) {
        assert.equal(JSON.stringify(brief).includes(privateValue), false, privateValue);
    }
});

test("departure brief prints dated itinerary entries in order", async () => {
    const booking = exampleBooking();
    booking.itineraryDays.push(
        { date: new Date("2027-03-03"), title: "Sigiriya", plan: "Climb the rock", overnightLocation: "Habarana" },
        { date: new Date("2027-03-01"), title: "Arrival", plan: "Airport pickup" }
    );
    const brief = buildOperationsBrief(booking);
    assert.equal(brief.sections[0].title, "Daily itinerary");
    assert.match(brief.sections[0].items[0].title, /Arrival/);
    assert.match(brief.sections[0].items[1].title, /Sigiriya/);
    assert.deepEqual(brief.sections[0].items[1].lines, ["Plan: Climb the rock", "Overnight: Habarana"]);
    const bytes = await createOperationsBriefPdf(brief, { companyName: "Dream Ceylon Journeys" });
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({ data: new Uint8Array(bytes), disableFontFace: true, useSystemFonts: false });
    try {
        const document = await task.promise;
        const content = await (await document.getPage(1)).getTextContent();
        const printed = content.items.map(({ str }) => str).join(" ");
        assert.match(printed, /Daily itinerary/);
        assert.match(printed, /Airport pickup/);
        assert.match(printed, /Overnight: Habarana/);
    } finally {
        await task.destroy();
    }
});

test("departure brief PDF keeps sections readable across multiple pages", async () => {
    const booking = exampleBooking();
    for (let index = 0; index < 45; index += 1) {
        booking.hotelStays.push({
            hotelName: `Hotel ${index} with a long descriptive name for the operations team`,
            checkInDate: new Date("2027-03-01"), checkOutDate: new Date("2027-03-02"), rooms: 1,
            notes: "PRIVATE HOTEL NOTE",
        });
    }
    const bytes = await createOperationsBriefPdf(buildOperationsBrief(booking), { companyName: "Dream Ceylon Journeys" });
    const document = await PDFDocument.load(bytes);
    assert.ok(document.getPageCount() >= 3);
    assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), "%PDF-");
});

test("departure brief PDF keeps Sinhala, Tamil, Cyrillic, and accented names", async () => {
    const booking = exampleBooking();
    booking.customer.fullName = "José සිංහල தமிழ் Жанна";
    booking.hotelStays[0].hotelName = "කොළඹ ஹோட்டல்";
    assert.equal(cleanPdfText(booking.customer.fullName), booking.customer.fullName);

    const bytes = await createOperationsBriefPdf(buildOperationsBrief(booking), { companyName: "Dream Ceylon Journeys" });
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({ data: new Uint8Array(bytes), disableFontFace: true, useSystemFonts: false });
    try {
        const document = await task.promise;
        assert.equal(document.numPages, 1);
        const content = await (await document.getPage(1)).getTextContent();
        const printed = content.items.map(({ str }) => str).join("").replace(/\s+/gu, "");
        for (const name of ["José", "සිංහල", "தமிழ்", "Жанна"]) {
            assert.ok(printed.includes(name), `${name} must remain searchable in the PDF`);
        }
    } finally {
        await task.destroy();
    }
});

test("departure PDF requires booking and PDF permissions and rejects cancelled trips", async (t) => {
    const bookingId = "507f1f77bcf86cd799439051";
    const salesId = "507f1f77bcf86cd799439052";
    const viewerId = "507f1f77bcf86cd799439053";
    const booking = exampleBooking();
    booking._id = bookingId;
    const logs = [];

    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({
        _id: id, role: String(id) === viewerId ? "Viewer" : "Sales", status: "Active", tokenVersion: 0,
    }) }));
    t.mock.method(Booking, "findById", (id) => ({ populate: async () => String(id) === bookingId ? booking : null }));
    t.mock.method(CompanySetting, "findOne", async () => null);
    t.mock.method(ActivityLog, "create", async (entry) => { logs.push(entry); return entry; });

    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const endpoint = `http://127.0.0.1:${server.address().port}/api/booking-pdf/operations-brief/${bookingId}`;
    const request = (url, id) => fetch(url, {
        method: "POST", headers: id ? { Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` } : {},
    });

    assert.equal((await request(endpoint)).status, 401);
    assert.equal((await request(endpoint, viewerId)).status, 403);
    assert.equal((await request(endpoint.replace(bookingId, "bad"), salesId)).status, 400);
    assert.equal((await request(endpoint.replace(bookingId, "507f1f77bcf86cd799439099"), salesId)).status, 404);

    const response = await request(endpoint, salesId);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /application\/pdf/);
    assert.match(response.headers.get("content-disposition"), /dream-ceylon-operations-DCJ-TEST-BRIEF\.pdf/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await PDFDocument.load(await response.arrayBuffer())).getPageCount(), 1);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].metadata.documentType, "Operations Brief");

    booking.bookingStatus = "Cancelled";
    assert.equal((await request(endpoint, salesId)).status, 409);
    assert.equal(logs.length, 1);
});
