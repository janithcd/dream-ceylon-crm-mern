import { test } from "node:test";
import assert from "node:assert/strict";
import { getBookingReadiness } from "./bookingReadiness.js";

const now = new Date("2027-03-01T18:30:00Z"); // March 2 in Sri Lanka
const completeBooking = () => ({
    bookingStatus: "Confirmed",
    travelStartDate: "2027-03-02",
    travelEndDate: "2027-03-04",
    customer: { fullName: "Test Guest", email: "guest@example.com", whatsappNumber: "+44 7700 900123" },
    numberOfTravelers: 2,
    travelerNames: ["First Traveler", "Second Traveler"],
    itineraryDays: [2, 3, 4].map((day) => ({ date: `2027-03-0${day}`, title: "Day plan" })),
    hotelStays: [{ hotelName: "Test Hotel", checkInDate: "2027-03-02", checkOutDate: "2027-03-04", status: "Confirmed", rooms: 1,
        roomingPlan: { assignments: ["1", "1"], rosterVersion: 0, roomCount: 1 } }],
    transportAssignments: [{
        route: "Hotel to airport", startDate: "2027-03-03", endDate: "2027-03-03", status: "Confirmed",
        chauffeurName: "Test Chauffeur", chauffeurPhone: "0771234567", registration: "CAB-1234",
        pickupTime: "23:00", pickupLocation: "Hotel lobby", dropoffLocation: "BIA departures",
        flight: { number: "UL505", direction: "Departure", date: "2027-03-04", time: "02:00", airport: "BIA" },
    }],
    preparationTasks: [{ title: "Confirm hotels", completedAt: "2027-03-01" }],
});
const findSection = (result, id) => result.sections.find((item) => item.id === id);

test("a fully recorded trip passes with an overnight airport pickup and no input changes", () => {
    const booking = completeBooking();
    const before = structuredClone(booking);
    const review = getBookingReadiness(booking, now);
    assert.equal(review.attentionCount, 0);
    assert.equal(review.unassessedCount, 0);
    assert.equal(review.sections.length, 6);
    assert.ok(review.sections.every((item) => item.status === "clear"));
    assert.deepEqual(booking, before);
    // No second-day pickup requirement is inferred from the scheduled flight.
    assert.deepEqual(findSection(review, "transport").issues, []);
});

test("transport-only bookings do not fail hotel coverage or claim unsaved plans are complete", () => {
    const booking = completeBooking();
    booking.hotelStays = [{ status: "Cancelled", checkInDate: "2027-03-02", checkOutDate: "2027-03-04" }];
    booking.itineraryDays = [];
    booking.preparationTasks = [];
    const review = getBookingReadiness(booking, now);
    assert.equal(review.attentionCount, 0);
    assert.equal(review.unassessedCount, 3);
    assert.equal(findSection(review, "hotels").status, "unassessed");
    assert.deepEqual(findSection(review, "hotels").issues, []);
    assert.match(findSection(review, "hotels").summary, /guest-arranged/);
    booking.transportAssignments = [];
    assert.equal(getBookingReadiness(booking, now).unassessedCount, 4);
});

test("traveler roster flags partial or mismatched names without exposing their identities", () => {
    const booking = completeBooking();
    booking.travelerNames = ["PRIVATE_TRAVELER_NAME"];
    const review = getBookingReadiness(booking, now);
    assert.equal(findSection(review, "travelers").status, "attention");
    assert.match(findSection(review, "travelers").issues.join(" "), /1 traveler name still missing/);
    assert.ok(!JSON.stringify(review).includes("PRIVATE_TRAVELER_NAME"));
    booking.travelerNames = [];
    assert.equal(findSection(getBookingReadiness(booking, now), "travelers").status, "unassessed");
    booking.travelerNames = ["One", "Two", "Three"];
    assert.match(findSection(getBookingReadiness(booking, now), "travelers").issues.join(" "), /More names/);
});

test("hotel review finds gaps, requested stays, overlaps and out-of-trip reservations", () => {
    const booking = completeBooking();
    booking.hotelStays = [
        { checkInDate: "2027-03-01", checkOutDate: "2027-03-03", status: "Confirmed" },
        { checkInDate: "2027-03-02", checkOutDate: "2027-03-03", status: "Requested" },
        { checkInDate: "2027-03-03", checkOutDate: "2027-03-04", status: "Cancelled" },
    ];
    const hotels = findSection(getBookingReadiness(booking, now), "hotels");
    assert.equal(hotels.status, "attention");
    assert.match(hotels.issues.join("\n"), /1 hotel stay awaiting confirmation/);
    assert.match(hotels.issues.join("\n"), /1 trip night without an active hotel stay/);
    assert.match(hotels.issues.join("\n"), /1 night with overlapping hotel stays/);
    assert.match(hotels.issues.join("\n"), /1 hotel stay extending outside/);
    assert.match(hotels.summary, /1 of 2 trip nights/);
});

test("hotel review flags unsaved and stale rooming plans without exposing room assignments", () => {
    const booking = completeBooking();
    booking.hotelStays.push({ status: "Confirmed", checkInDate: "2027-03-02", checkOutDate: "2027-03-03", rooms: 1 });
    booking.hotelStays[0].roomingPlan.assignments = ["1", "not-staying"];
    booking.travelerRosterVersion = 1;
    const review = getBookingReadiness(booking, now);
    const issues = findSection(review, "hotels").issues.join(" ");
    assert.match(issues, /1 confirmed hotel stay without a saved rooming plan/);
    assert.match(issues, /1 saved rooming plan needing review/);
    assert.ok(!JSON.stringify(review).includes("not-staying"));
});

test("Sri Lanka day boundaries govern itinerary coverage and overdue tasks", () => {
    const booking = completeBooking();
    booking.travelStartDate = "2027-03-01T18:30:00Z";
    booking.travelEndDate = "2027-03-03T18:30:00Z";
    booking.itineraryDays = [{ date: "2027-03-01T18:30:00Z", title: "Arrival" }, { date: "2027-03-04", title: "Departure" }];
    booking.preparationTasks = [
        { dueDate: "2027-03-01", completedAt: null, assignedTo: "staff" },
        { dueDate: "2027-03-02", completedAt: null, assignedTo: null },
        { dueDate: "2027-03-01", completedAt: "2027-03-01", assignedTo: null },
        { dueDate: null, completedAt: null, assignedTo: "staff" },
    ];
    const review = getBookingReadiness(booking, now);
    assert.match(findSection(review, "itinerary").issues.join("\n"), /1 trip day without/);
    const tasks = findSection(review, "tasks");
    assert.match(tasks.issues.join("\n"), /3 preparation tasks still open/);
    assert.match(tasks.issues.join("\n"), /1 open task overdue/);
    assert.match(tasks.issues.join("\n"), /1 open task without an assignee/);
    const beforeMidnight = getBookingReadiness(booking, new Date("2027-03-01T18:29:59Z"));
    assert.ok(!findSection(beforeMidnight, "tasks").issues.some((issue) => issue.includes("overdue")));
});

test("duplicate, invalid and out-of-trip itinerary entries cannot hide a missing day", () => {
    const booking = completeBooking();
    booking.itineraryDays = [
        { date: "2027-03-02", title: "Arrival" }, { date: "2027-03-02", title: "Duplicate" },
        { date: "2027-03-05", title: "Outside" }, { date: "invalid", title: "" },
    ];
    const itinerary = findSection(getBookingReadiness(booking, now), "itinerary");
    assert.equal(itinerary.status, "attention");
    assert.match(itinerary.issues.join("\n"), /2 trip days without/);
    assert.match(itinerary.issues.join("\n"), /invalid dates/);
    assert.match(itinerary.issues.join("\n"), /outside the trip/);
    assert.match(itinerary.issues.join("\n"), /same day/);
    assert.match(itinerary.issues.join("\n"), /missing a title/);
});

test("missing pickup details and partial flights need attention while cancelled legs are ignored", () => {
    const booking = completeBooking();
    booking.transportAssignments[0].chauffeurPhone = " ";
    booking.transportAssignments[0].pickupTime = "25:00";
    booking.transportAssignments[0].flight = { direction: "Departure", number: "UL505", date: "2027-03-04" };
    booking.transportAssignments.push(
        { route: "Requested leg", startDate: "2027-03-02", endDate: "2027-03-02", status: "Requested" },
        { route: "Cancelled leg", status: "Cancelled" },
    );
    const transport = findSection(getBookingReadiness(booking, now), "transport");
    const issues = transport.issues.join("\n");
    assert.match(issues, /1 transport leg awaiting confirmation/);
    assert.match(issues, /Hotel to airport: add chauffeur phone, valid pickup time, scheduled flight time, airport/);
    assert.ok(!issues.includes("Cancelled leg"));
    assert.ok(!issues.includes("flight date"));
    assert.match(transport.summary, /2 active transport legs/);
});

test("same-day trips, invalid ranges and bookings with old incomplete records stay explicit", () => {
    const dayTrip = completeBooking();
    dayTrip.travelEndDate = dayTrip.travelStartDate;
    dayTrip.itineraryDays = [dayTrip.itineraryDays[0]];
    dayTrip.hotelStays = [];
    dayTrip.transportAssignments[0].startDate = dayTrip.travelStartDate;
    dayTrip.transportAssignments[0].endDate = dayTrip.travelStartDate;
    dayTrip.transportAssignments[0].flight = null;
    const dayReview = getBookingReadiness(dayTrip, now);
    assert.equal(dayReview.attentionCount, 0);
    assert.equal(findSection(dayReview, "itinerary").status, "clear");

    const broken = completeBooking();
    broken.travelStartDate = "invalid";
    broken.hotelStays[0].checkOutDate = "2027-03-01";
    broken.transportAssignments[0].endDate = "2027-03-01";
    const brokenReview = getBookingReadiness(broken, now);
    assert.match(findSection(brokenReview, "booking").issues.join("\n"), /Travel dates/);
    assert.equal(findSection(brokenReview, "itinerary").status, "unassessed");
    assert.match(findSection(brokenReview, "hotels").issues.join("\n"), /invalid check-in/);
    assert.match(findSection(brokenReview, "transport").issues.join("\n"), /start or end date/);

    const legacy = getBookingReadiness({ bookingStatus: "Pending", customer: { whatsappNumber: "0771234567" } }, now);
    assert.equal(legacy.attentionCount, 1);
    assert.equal(legacy.unassessedCount, 5);
    assert.match(findSection(legacy, "booking").issues.join("\n"), /full international number/);
});

test("completed and cancelled bookings are not assessed even when they have unfinished work", () => {
    for (const bookingStatus of ["Completed", "Cancelled"]) {
        const review = getBookingReadiness({ ...completeBooking(), bookingStatus, preparationTasks: [{ completedAt: null }] }, now);
        assert.equal(review.inactive, true);
        assert.deepEqual(review.sections, []);
    }
});

test("review summaries exclude financial data, private notes, task text and guest contact values", () => {
    const booking = completeBooking();
    booking.adminNotes = "PRIVATE_ADMIN_NOTE";
    booking.specialRequests = "PRIVATE_GUEST_REQUEST";
    booking.totalPrice = 1234567;
    booking.paymentStatus = "PRIVATE_PAYMENT_STATE";
    booking.hotelStays[0].notes = "PRIVATE_HOTEL_NOTE";
    booking.transportAssignments[0].notes = "PRIVATE_CHAUFFEUR_NOTE";
    booking.preparationTasks = [{ title: "PRIVATE_TASK_TITLE", notes: "PRIVATE_TASK_NOTE" }];
    const output = JSON.stringify(getBookingReadiness(booking, now));
    for (const value of ["PRIVATE_", "1234567", booking.customer.fullName, booking.customer.email, booking.customer.whatsappNumber]) {
        assert.ok(!output.includes(value), `Review must exclude ${value}`);
    }
});
