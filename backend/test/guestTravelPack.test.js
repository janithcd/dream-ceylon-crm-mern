const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
process.env.JWT_SECRET = "synthetic-ci-secret-never-use-in-production";
const app = require("../app");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const CompanySetting = require("../models/CompanySetting");
const ActivityLog = require("../models/ActivityLog");
const { buildGuestTravelPack } = require("../utils/guestTravelPack");
const { createGuestItineraryPdf } = require("../controllers/guestItineraryPdfController");
const company = { companyName: "Dream Ceylon Journeys", email: "info@example.test", whatsapp: "+94770000000" };
const example = () => ({
    _id: "507f1f77bcf86cd799439061", bookingCode: "DCJ-PACK-TEST", bookingStatus: "Confirmed",
    customer: { fullName: "José සිංහල தமிழ்", email: "guest@example.test", whatsappNumber: "PRIVATE GUEST PHONE" },
    numberOfTravelers: 2, travelStartDate: new Date("2027-03-01"), travelEndDate: new Date("2027-03-03"),
    totalPrice: 987654, advancePayment: 456789, adminNotes: "PRIVATE ADMIN", specialRequests: "PRIVATE REQUEST",
    itineraryDays: [{ date: new Date("2027-03-02"), title: "Explore the park", plan: "A morning outdoors", overnightLocation: "Yala" },
        { date: new Date("2027-03-01"), title: "Arrival", plan: "Meet your chauffeur" }],
    hotelStays: [{ status: "Confirmed", hotelName: "Test Hotel", checkInDate: new Date("2027-03-01"), checkOutDate: new Date("2027-03-03"), rooms: 1,
        roomType: "Double", mealPlan: "Half Board", confirmationNumber: "HOTEL-123", notes: "PRIVATE HOTEL NOTE", supplierEmail: "private-supplier@example.test" },
        { status: "Requested", hotelName: "OMITTED HOTEL" }],
    transportAssignments: [{ status: "Confirmed", route: "Airport to hotel", startDate: new Date("2027-03-01"), endDate: new Date("2027-03-01"),
        pickupTime: "06:30", pickupLocation: "Arrivals hall", dropoffLocation: "Test Hotel", chauffeurName: "Test Chauffeur", chauffeurPhone: "+94771111111",
        vehicleDescription: "Air-conditioned car", registration: "TEST-001", notes: "PRIVATE TRANSPORT NOTE" }],
    excursions: [{ status: "Confirmed", title: "Morning safari", date: new Date("2027-03-02"), startTime: "05:30", participants: 2, supplierName: "Test Jeep Operator",
        meetingPoint: "Hotel lobby", confirmationReference: "SAF-123", guestInstructions: "Bring a hat", internalNotes: "PRIVATE ACTIVITY NOTE", supplierEmail: "private-operator@example.test" },
        { status: "Cancelled", title: "OMITTED ACTIVITY" }],
});
const readPdf = async (bytes) => {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({ data: new Uint8Array(bytes), disableFontFace: true, useSystemFonts: false });
    try {
        const pdf = await task.promise, pages = [];
        for (let page = 1; page <= pdf.numPages; page++) pages.push((await (await pdf.getPage(page)).getTextContent()).items.map(({ str }) => str).join(" "));
        return { count: pdf.numPages, text: pages.join(" "), pages };
    } finally { await task.destroy(); }
};

test("travel pack shares explicit guest fields, flags omissions, and fingerprints only relevant content", () => {
    const booking = example(), review = buildGuestTravelPack(booking, company);
    assert.equal(review.ready, true);
    assert.deepEqual(review.counts, { itinerary: 2, hotels: 1, transport: 1, activities: 1 });
    assert.ok(review.warnings.some((warning) => warning.includes("1 hotel arrangement(s)")));
    assert.ok(review.warnings.some((warning) => warning.includes("1 trip date(s)")));
    const output = JSON.stringify(review.pack);
    for (const secret of ["PRIVATE", "private-", "987654", "456789", "OMITTED", "guest@example.test"]) assert.equal(output.includes(secret), false, secret);
    for (const included of ["HOTEL-123", "SAF-123", "Bring a hat", "Test Chauffeur", "+94771111111"]) assert.ok(output.includes(included), included);
    assert.deepEqual(review.pack.entries.map((entry) => entry.date), ["2027-03-01", "2027-03-01", "2027-03-01", "2027-03-02", "2027-03-02"]);
    booking.adminNotes = "Different private note"; booking.totalPrice = 1;
    assert.equal(buildGuestTravelPack(booking, company).fingerprint, review.fingerprint);
    booking.excursions[0].startTime = "06:00";
    assert.notEqual(buildGuestTravelPack(booking, company).fingerprint, review.fingerprint);
    assert.notEqual(buildGuestTravelPack(example(), { ...company, email: "new@example.test" }).fingerprint, review.fingerprint);
});

test("travel pack blocks closed and malformed trips; missing confirmations and details are explicit", () => {
    for (const status of ["Pending", "Cancelled", "Completed"]) assert.equal(buildGuestTravelPack({ ...example(), bookingStatus: status }, company).ready, false);
    for (const changes of [{ travelStartDate: null }, { travelEndDate: "2026-01-01" }, { numberOfTravelers: 0 }, { itineraryDays: [] }]) assert.equal(buildGuestTravelPack({ ...example(), ...changes }).ready, false);
    const booking = example(); booking.hotelStays[0].checkOutDate = new Date("2027-03-04");
    assert.equal(buildGuestTravelPack(booking).ready, false);
    booking.hotelStays = []; booking.transportAssignments[0].chauffeurPhone = "";
    const review = buildGuestTravelPack(booking);
    assert.ok(review.warnings.some((warning) => warning.includes("chauffeur phone is missing")));
    assert.ok(review.pack.entries.some((entry) => entry.details.includes("Chauffeur phone: To be confirmed")));
    booking.excursions[0].status = "Cancellation requested";
    assert.equal(buildGuestTravelPack(booking).counts.activities, 0);
    booking.bookingStatus = "In Progress"; booking.excursions[0].status = "Completed";
    assert.equal(buildGuestTravelPack(booking).counts.activities, 1);
});

test("travel pack PDF paginates long details and preserves multilingual text without private data", async () => {
    const booking = example();
    booking.excursions[0].guestInstructions = "Bring comfortable clothing, drinking water and sun protection. ".repeat(8);
    for (let index = 0; index < 12; index++) booking.itineraryDays.push({ date: new Date("2027-03-03"), title: `Scenic stop ${index}`, plan: "Explore the landscape at your own pace. ".repeat(20) });
    const { pack } = buildGuestTravelPack(booking, company);
    const pdf = await readPdf(await createGuestItineraryPdf(pack, company, { title: "YOUR TRAVEL PACK", introduction: pack.notice }));
    assert.ok(pdf.count > 2);
    assert.ok(pdf.pages.every((page) => page.includes("YOUR TRAVEL PACK") && page.includes("DCJ-PACK-TEST")), "Every page retains its document title and booking reference");
    for (const text of ["YOUR TRAVEL PACK", "HOTEL-123", "SAF-123", "Scenic stop 11", "Chauffeur phone", "Half Board"]) assert.ok(pdf.text.includes(text), text);
    for (const name of ["José", "සිංහල", "தமிழ்"]) assert.ok(pdf.text.replace(/\s+/gu, "").includes(name), name);
    for (const secret of ["PRIVATE", "private-", "987654", "456789", "OMITTED", "guest@example.test"]) assert.equal(pdf.text.includes(secret), false, secret);
});

test("travel pack API requires permissions, reviewed current content and logs only document metadata", async (t) => {
    const booking = example(), logs = [];
    let readsUntilChange = 0;
    const sales = "507f1f77bcf86cd799439062", viewer = "507f1f77bcf86cd799439063";
    t.mock.method(Admin, "findById", (id) => ({ select: async () => ({ _id: id, role: String(id) === viewer ? "Viewer" : "Sales", status: "Active", tokenVersion: 0 }) }));
    t.mock.method(Booking, "findById", async (id) => {
        if (readsUntilChange && --readsUntilChange === 0) booking.excursions[0].meetingPoint = "Changed during rendering";
        return String(id) === booking._id ? booking : null;
    });
    t.mock.method(CompanySetting, "findOne", async () => null);
    t.mock.method(ActivityLog, "create", async (entry) => { logs.push(entry); return entry; });
    const server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}/api/booking-pdf/travel-pack/${booking._id}`;
    const request = (path = "/preview", method = "GET", body, user = sales) => fetch(`${url}${path}`, { method,
        headers: { ...(user ? { Authorization: `Bearer ${jwt.sign({ id: user }, process.env.JWT_SECRET)}` } : {}), "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body) });
    assert.equal((await request("/preview", "GET", undefined, null)).status, 401);
    assert.equal((await request("/preview", "GET", undefined, viewer)).status, 403);
    assert.equal((await request("", "POST", {}, viewer)).status, 403);
    const response = await request(); assert.equal(response.headers.get("cache-control"), "no-store");
    const review = await response.json(); assert.equal(review.ready, true);
    assert.equal((await request("", "POST", { fingerprint: review.fingerprint })).status, 400);
    booking.transportAssignments[0].pickupTime = "07:00";
    assert.equal((await request("", "POST", { reviewed: true, fingerprint: review.fingerprint })).status, 409);
    const current = await (await request()).json();
    const downloaded = await request("", "POST", { reviewed: true, fingerprint: current.fingerprint });
    assert.equal(downloaded.status, 200); assert.match(downloaded.headers.get("content-type"), /application\/pdf/);
    assert.match(downloaded.headers.get("content-disposition"), /dream-ceylon-travel-pack-DCJ-PACK-TEST\.pdf/);
    assert.equal(downloaded.headers.get("cache-control"), "no-store");
    assert.match((await readPdf(await downloaded.arrayBuffer())).text, /07:00/);
    assert.equal(logs.length, 1); assert.equal(logs[0].metadata.documentType, "Guest Travel Pack");
    assert.equal(JSON.stringify(logs).includes("PRIVATE"), false);
    readsUntilChange = 2;
    assert.equal((await request("", "POST", { reviewed: true, fingerprint: current.fingerprint })).status, 409);
    assert.equal(logs.length, 1);
    booking.bookingStatus = "Cancelled";
    assert.equal((await request("", "POST", { reviewed: true, fingerprint: current.fingerprint })).status, 409);
});
