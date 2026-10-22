const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const Booking = require("../models/Booking");
const BookingPayment = require("../models/BookingPayment");
const TourPackage = require("../models/TourPackage");
const Quotation = require("../models/Quotation");
const ActivityLog = require("../models/ActivityLog");
const { PDFDocument } = require("pdf-lib");

const main = async () => {
    if (process.env.CI_SMOKE_TESTS !== "true") {
        throw new Error("This smoke test must be explicitly enabled in CI");
    }

    await mongoose.connect(process.env.MONGO_URI);
    let admin;
    let otherAdmin;
    let booking;
    let overlappingBooking;
    let tourPackage;
    let quotation;

    try {
        const dayMs = 24 * 60 * 60 * 1000;
        const travelStart = new Date(Date.now() + 5 * dayMs);
        const travelEnd = new Date(Date.now() + 10 * dayMs);
        const hotelCheckout = new Date(Date.now() + 7 * dayMs);
        const dateOnly = (date) => {
            const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
                timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit",
            }).formatToParts(date).map(({ type, value }) => [type, value]));
            return `${parts.year}-${parts.month}-${parts.day}`;
        };

        admin = await Admin.create({
            name: "CI Booking Test",
            email: `ci-booking-${Date.now()}@example.invalid`,
            password: "disposable-ci-only-password",
            role: "Sales",
        });
        booking = await Booking.create({
            customer: { fullName: "CI Guest", email: "guest@example.invalid", whatsappNumber: "+94771234567", country: "UK" },
            travelStartDate: new Date(dateOnly(travelStart)),
            travelEndDate: new Date(dateOnly(travelEnd)),
            numberOfTravelers: 2,
            totalPrice: 1000,
        });

        const token = jwt.sign({ id: admin._id, v: 0 }, process.env.JWT_SECRET);
        const url = `http://127.0.0.1:5000/api/bookings/${booking._id}/preparation-tasks`;
        const request = (path, method, body) => fetch(path, {
            method,
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const getAttention = async () => {
            const response = await request("http://127.0.0.1:5000/api/dashboard/stats", "GET");
            const body = await response.json();
            assert.equal(response.status, 200, `Dashboard stats: ${JSON.stringify(body)}`);
            return body.bookingAttention;
        };
        const ownAttention = async () => (await getAttention()).items.find((item) => item.bookingCode === booking.bookingCode);
        const getMine = async (params = "", authToken = token) => {
            const response = await fetch(`http://127.0.0.1:5000/api/bookings/my-tasks${params}`, {
                headers: { Authorization: `Bearer ${authToken}` },
            });
            const body = await response.json();
            assert.equal(response.status, 200, `My tasks: ${JSON.stringify(body)}`);
            return body;
        };
        const getTeam = async (params = "") => {
            const response = await request(`http://127.0.0.1:5000/api/bookings/team-tasks${params}`, "GET");
            const body = await response.json();
            assert.equal(response.status, 200, `Team tasks: ${JSON.stringify(body)}`);
            return body;
        };
        const getSupplierQueue = async (params = "") => {
            const response = await request(`http://127.0.0.1:5000/api/bookings/supplier-confirmations${params}`, "GET");
            const body = await response.json();
            assert.equal(response.status, 200, `Supplier queue: ${JSON.stringify(body)}`);
            return body;
        };

        const quotationsUrl = "http://127.0.0.1:5000/api/quotations";
        const validityClient = `CI Validity ${Date.now()}`;
        assert.equal((await request(quotationsUrl, "POST", {
            clientName: validityClient, tourTitle: "CI tour", status: "Sent", validUntil: "2027-02-30",
        })).status, 400);
        const savedQuotation = await request(quotationsUrl, "POST", {
            clientName: validityClient, tourTitle: "CI tour", status: "Sent", validUntil: dateOnly(new Date(Date.now() - dayMs)),
            vehicleDailyRate: 80, vehicleDays: 5,
        });
        assert.equal(savedQuotation.status, 201, `Create quotation: ${await savedQuotation.clone().text()}`);
        const saved = (await savedQuotation.json()).quotation;
        quotation = saved._id;
        assert.equal(dateOnly(new Date(saved.validUntil)), dateOnly(new Date(Date.now() - dayMs)));
        const listValidity = async (filter) => {
            const response = await request(`${quotationsUrl}?keyword=${encodeURIComponent(validityClient)}&validity=${filter}`, "GET");
            assert.equal(response.status, 200, `Quotation validity filter: ${await response.clone().text()}`);
            return response.json();
        };
        assert.equal((await listValidity("pastDue")).totalQuotations, 1);
        assert.equal((await listValidity("dueSoon")).totalQuotations, 0);
        assert.equal((await request(`${quotationsUrl}?validity=invalid`, "GET")).status, 400);
        const quotationUrl = `${quotationsUrl}/${quotation}`;
        const nextValidity = dateOnly(new Date(Date.now() + 2 * dayMs));
        assert.equal((await request(quotationUrl, "PUT", { validUntil: "2027-02-30" })).status, 400);
        const updatedValidity = await request(quotationUrl, "PUT", { validUntil: nextValidity });
        assert.equal(updatedValidity.status, 200, `Update quotation validity: ${await updatedValidity.clone().text()}`);
        assert.equal(dateOnly(new Date((await updatedValidity.json()).quotation.validUntil)), nextValidity);
        assert.equal((await listValidity("pastDue")).totalQuotations, 0);
        assert.equal((await listValidity("dueSoon")).totalQuotations, 1);
        const savedPdf = await request(`${quotationsUrl}/pdf`, "POST", {
            quotationNo: saved.quotationNo, quotationDate: saved.createdAt, validUntil: nextValidity,
            booking: booking._id, clientName: validityClient, tourTitle: "CI tour", vehicleDailyRate: 80, vehicleDays: 5,
        });
        assert.equal(savedPdf.status, 200, `Quotation PDF: ${await savedPdf.clone().text()}`);
        assert.equal((await PDFDocument.load(await savedPdf.arrayBuffer())).getPageCount() >= 1, true);
        assert.equal((await request(quotationUrl, "PUT", { validUntil: null })).status, 200);
        assert.equal((await listValidity("noDate")).totalQuotations, 1);
        assert.equal((await Quotation.findById(quotation)).validUntil, null);

        const assignees = await request("http://127.0.0.1:5000/api/bookings/preparation-assignees", "GET");
        assert.equal(assignees.status, 200);
        assert.ok((await assignees.json()).admins.some((item) => item._id === String(admin._id)));

        const added = await request(url, "POST", {
            title: "Confirm hotel", assignedTo: String(admin._id),
            dueDate: dateOnly(new Date(Date.now() - dayMs)),
            priority: "High",
            notes: "  Check supplier room availability  ",
        });
        const addedBody = await added.text();
        assert.equal(added.status, 201, `Add task: ${addedBody}`);
        const tasks = (await Booking.findById(booking._id)).preparationTasks;
        assert.equal(tasks.length, 1);
        assert.equal(tasks[0].title, "Confirm hotel");
        assert.equal(String(tasks[0].assignedTo), String(admin._id));
        assert.equal(tasks[0].priority, "High");
        assert.equal(tasks[0].notes, "Check supplier room availability");
        const bookingView = await request(`http://127.0.0.1:5000/api/bookings/${booking._id}`, "GET");
        assert.equal(bookingView.status, 200);
        assert.equal((await bookingView.json()).preparationTasks[0].assignedTo.name, "CI Booking Test");

        const itineraryUrl = `http://127.0.0.1:5000/api/bookings/${booking._id}/itinerary`;
        const itineraryAdded = await request(itineraryUrl, "POST", {
            date: dateOnly(travelStart), title: "Arrival", plan: "Airport pickup", overnightLocation: "Colombo",
        });
        assert.equal(itineraryAdded.status, 201, `Add itinerary: ${await itineraryAdded.clone().text()}`);
        const itineraryDay = (await itineraryAdded.json()).days[0];
        assert.equal(itineraryDay.title, "Arrival");
        assert.equal((await (await request(itineraryUrl, "GET")).json()).days.length, 1);
        assert.equal((await request(itineraryUrl, "POST", {
            date: dateOnly(new Date(Date.now() + 20 * dayMs)), title: "Outside trip",
        })).status, 400);
        const itineraryUpdated = await request(`${itineraryUrl}/${itineraryDay._id}`, "PUT", {
            date: dateOnly(travelStart), title: "Airport arrival", plan: "Meet driver at arrivals", overnightLocation: "Colombo",
        });
        assert.equal(itineraryUpdated.status, 200, `Edit itinerary: ${await itineraryUpdated.clone().text()}`);
        assert.equal((await Booking.findById(booking._id)).itineraryDays[0].title, "Airport arrival");
        assert.equal((await request(`http://127.0.0.1:5000/api/bookings/${booking._id}`, "PUT", {
            travelStartDate: dateOnly(new Date(Date.now() + 8 * dayMs)),
        })).status, 400);
        assert.equal((await ownAttention()).openTaskCount, 1);
        assert.equal((await ownAttention()).overdueTaskCount, 1);
        const overdueMine = await getMine("?dateFilter=overdue");
        assert.equal(overdueMine.summary.overdue, 1);
        assert.equal(overdueMine.total, 1);
        assert.equal(overdueMine.items[0].bookingCode, booking.bookingCode);
        assert.equal(overdueMine.items[0].priority, "High");
        assert.equal(overdueMine.items[0].notes, "Check supplier room availability");
        assert.equal((await getMine("?priorityFilter=high")).total, 1);
        assert.equal((await getTeam()).summary.assigned, 1);
        assert.equal((await getTeam()).total, 0);

        const taskUrl = `${url}/${tasks[0]._id}`;
        const rescheduled = await request(taskUrl, "PUT", { dueDate: dateOnly(new Date(Date.now() + dayMs)), priority: "Low", notes: "Supplier confirmed" });
        assert.equal(rescheduled.status, 200);
        assert.equal(String((await Booking.findById(booking._id)).preparationTasks[0].assignedTo), String(admin._id));
        assert.equal((await Booking.findById(booking._id)).preparationTasks[0].priority, "Low");
        assert.equal((await Booking.findById(booking._id)).preparationTasks[0].notes, "Supplier confirmed");
        assert.equal((await getMine("?priorityFilter=high")).total, 0);
        assert.equal((await getMine()).items[0].priority, "Low");
        assert.equal((await ownAttention()).overdueTaskCount, 0);
        assert.equal((await getMine("?dateFilter=upcoming")).total, 1);

        const urgent = await request(url, "POST", {
            title: "Confirm guide", assignedTo: String(admin._id),
            dueDate: dateOnly(new Date(Date.now() + dayMs)), priority: "High",
        });
        assert.equal(urgent.status, 201);
        const urgentId = (await urgent.json()).tasks.find((task) => task.title === "Confirm guide")._id;
        assert.deepEqual((await getMine("?dateFilter=upcoming")).items.map((task) => task.priority), ["High", "Low"]);
        assert.equal((await getMine("?dateFilter=upcoming&priorityFilter=high")).total, 1);
        assert.equal((await request(`${url}/${urgentId}`, "DELETE")).status, 200);

        const completed = await request(taskUrl, "PATCH", { completed: true });
        assert.equal(completed.status, 200);
        assert.ok((await Booking.findById(booking._id)).preparationTasks[0].completedAt);
        assert.equal(String((await Booking.findById(booking._id)).preparationTasks[0].assignedTo), String(admin._id));
        assert.equal(await ownAttention(), undefined);
        assert.equal((await getMine()).total, 0);
        assert.equal((await getMine("?status=completed")).total, 1);

        const reopened = await request(taskUrl, "PATCH", { completed: false });
        assert.equal(reopened.status, 200);
        assert.equal((await Booking.findById(booking._id)).preparationTasks[0].completedAt, null);
        assert.equal((await ownAttention()).openTaskCount, 1);
        assert.equal((await getMine()).summary.open, 1);

        const unassigned = await request(taskUrl, "PUT", { assignedTo: null, dueDate: null });
        assert.equal(unassigned.status, 200);
        const unassignedTask = (await Booking.findById(booking._id)).preparationTasks[0];
        assert.equal(unassignedTask.assignedTo, null);
        assert.equal(unassignedTask.dueDate, null);
        const teamBeforeClaim = await getTeam("?dateFilter=noDue");
        assert.equal(teamBeforeClaim.total, 1);
        assert.equal(teamBeforeClaim.summary.unassigned, 1);
        assert.equal(teamBeforeClaim.items[0].notes, "Supplier confirmed");

        otherAdmin = await Admin.create({
            name: "CI Other Agent",
            email: `ci-other-${Date.now()}@example.invalid`,
            password: "disposable-ci-only-password",
            role: "Sales",
        });
        const otherToken = jwt.sign({ id: otherAdmin._id, v: 0 }, process.env.JWT_SECRET);
        const claimUrl = `${taskUrl}/claim`;
        const claims = await Promise.all([
            request(claimUrl, "PATCH"),
            fetch(claimUrl, { method: "PATCH", headers: { Authorization: `Bearer ${otherToken}` } }),
        ]);
        assert.deepEqual(claims.map((response) => response.status).sort(), [200, 409]);
        const claimedBy = String((await Booking.findById(booking._id)).preparationTasks[0].assignedTo);
        assert.ok([String(admin._id), String(otherAdmin._id)].includes(claimedBy));
        assert.equal((await getTeam()).summary.unassigned, 0);
        const assignedTeam = await getTeam("?assignment=assigned");
        assert.equal(assignedTeam.total, 1);
        assert.equal(assignedTeam.items[0].assignee.name, claimedBy === String(admin._id) ? "CI Booking Test" : "CI Other Agent");

        const removed = await request(taskUrl, "DELETE");
        assert.equal(removed.status, 200);
        assert.equal((await Booking.findById(booking._id)).preparationTasks.length, 0);
        assert.equal(await ownAttention(), undefined);

        const hotelsUrl = `http://127.0.0.1:5000/api/bookings/${booking._id}/hotel-stays`;
        const hotelAdded = await request(hotelsUrl, "POST", {
            hotelName: "CI Hotel",
            location: "Sigiriya",
            supplierEmail: "Reservations@Hotel.example",
            checkInDate: dateOnly(travelStart),
            checkOutDate: dateOnly(hotelCheckout),
            followUpDate: dateOnly(new Date(Date.now() - dayMs)),
            rooms: 1,
            mealPlan: "Half Board",
        });
        const hotelAddedBody = await hotelAdded.text();
        assert.equal(hotelAdded.status, 201, `Add hotel stay: ${hotelAddedBody}`);
        const hotel = (await Booking.findById(booking._id)).hotelStays[0];
        assert.equal(hotel.hotelName, "CI Hotel");
        assert.equal(hotel.supplierEmail, "reservations@hotel.example");
        assert.equal((await ownAttention()).pendingHotelCount, 1);
        const overdueSupplierQueue = await getSupplierQueue("?type=hotel&dateFilter=overdue");
        assert.equal(overdueSupplierQueue.summary.hotels, 1);
        assert.equal(overdueSupplierQueue.summary.overdue, 1);
        assert.equal(overdueSupplierQueue.total, 1);
        assert.equal(overdueSupplierQueue.items[0].bookingCode, booking.bookingCode);
        assert.equal(overdueSupplierQueue.items[0].title, "CI Hotel");
        assert.equal("customerEmail" in overdueSupplierQueue.items[0], false);
        const dueSupplierQueue = await getSupplierQueue("?dateFilter=actionable");
        assert.equal(dueSupplierQueue.total, 1);
        assert.equal(dueSupplierQueue.items[0].title, "CI Hotel");

        const hotelUrl = `${hotelsUrl}/${hotel._id}`;
        const draftLogCount = await ActivityLog.countDocuments({ relatedRecordId: booking._id });
        const hotelDraftResponse = await request(`${hotelUrl}/confirmation-draft`, "GET");
        assert.equal(hotelDraftResponse.status, 200);
        assert.equal(hotelDraftResponse.headers.get("cache-control"), "no-store");
        const hotelDraft = await hotelDraftResponse.json();
        assert.equal(hotelDraft.recipient, "reservations@hotel.example");
        assert.match(hotelDraft.body, /CI Hotel/);
        assert.match(hotelDraft.body, /Half Board/);
        assert.equal(JSON.stringify(hotelDraft).includes("cost"), false);
        assert.equal(await ActivityLog.countDocuments({ relatedRecordId: booking._id }), draftLogCount, "A draft must not log supplier contact");
        const hotelContactUrl = `http://127.0.0.1:5000/api/bookings/${booking._id}/supplier-contacts/hotel/${hotel._id}`;
        assert.equal((await request(hotelContactUrl, "GET")).status, 200);
        assert.equal((await request(hotelContactUrl, "POST", {
            channel: "Email", note: "Private supplier reply", nextFollowUpDate: dateOnly(new Date(Date.now() + 15 * dayMs)),
        })).status, 400, "A follow-up cannot be after check-in");
        const loggedHotel = await request(hotelContactUrl, "POST", {
            channel: "Email", note: "  Private supplier reply  ", nextFollowUpDate: dateOnly(new Date()),
        });
        assert.equal(loggedHotel.status, 200, `Hotel contact: ${await loggedHotel.clone().text()}`);
        assert.equal(loggedHotel.headers.get("cache-control"), "no-store");
        const hotelHistory = await loggedHotel.json();
        assert.equal(hotelHistory.contacts.length, 1);
        assert.equal(hotelHistory.contacts[0].note, "Private supplier reply");
        assert.equal(hotelHistory.contacts[0].contactedBy, "CI Booking Test");
        assert.equal(dateOnly(new Date(hotelHistory.followUpDate)), dateOnly(new Date()));
        assert.equal((await getSupplierQueue("?type=hotel&dateFilter=today")).items[0].lastContactChannel, "Email");
        const queueHotel = (await getSupplierQueue()).items[0];
        assert.ok(queueHotel.lastContactedAt);
        assert.equal("contacts" in queueHotel, false);
        assert.equal(JSON.stringify(queueHotel).includes("Private supplier reply"), false);
        const hotelContactActivity = await ActivityLog.findOne({ relatedRecordId: booking._id, description: /Hotel supplier contact logged/ });
        assert.ok(hotelContactActivity);
        assert.equal(JSON.stringify(hotelContactActivity).includes("Private supplier reply"), false);
        const confirmed = await request(hotelUrl, "PUT", { status: "Confirmed", confirmationNumber: "CI-123" });
        const confirmedBody = await confirmed.text();
        assert.equal(confirmed.status, 200, `Confirm hotel stay: ${confirmedBody}`);
        assert.equal((await request(`${hotelUrl}/confirmation-draft`, "GET")).status, 409);
        assert.equal((await request(hotelContactUrl, "POST", { channel: "Phone", nextFollowUpDate: null })).status, 409);
        assert.equal((await (await request(hotelContactUrl, "GET")).json()).contacts.length, 1);
        assert.equal((await Booking.findById(booking._id)).hotelStays[0].confirmationNumber, "CI-123");
        assert.equal(await ownAttention(), undefined);

        const hotelRemoved = await request(hotelUrl, "DELETE");
        assert.equal(hotelRemoved.status, 200);
        assert.equal((await Booking.findById(booking._id)).hotelStays.length, 0);

        const transportUrl = `http://127.0.0.1:5000/api/bookings/${booking._id}/transport-assignments`;
        const pendingTransport = await request(transportUrl, "POST", {
            route: "CI Airport Transfer", startDate: dateOnly(travelStart), endDate: dateOnly(travelStart),
            followUpDate: dateOnly(new Date()), status: "Requested",
        });
        assert.equal(pendingTransport.status, 201);
        const pendingTransportId = (await pendingTransport.json()).assignments[0]._id;
        assert.equal((await ownAttention()).pendingTransportCount, 1);
        const unscheduledTransport = await request(transportUrl, "POST", {
            route: "CI Unscheduled Transfer", startDate: dateOnly(travelEnd), endDate: dateOnly(travelEnd),
            status: "Requested",
        });
        assert.equal(unscheduledTransport.status, 201);
        const unscheduledTransportId = (await unscheduledTransport.json()).assignments[1]._id;
        const noDateSupplierQueue = await getSupplierQueue("?dateFilter=noDue");
        assert.equal(noDateSupplierQueue.summary.noDue, 1);
        assert.equal(noDateSupplierQueue.total, 1);
        assert.equal(noDateSupplierQueue.items[0].title, "CI Unscheduled Transfer");
        assert.equal((await getSupplierQueue("?dateFilter=actionable")).total, 1);
        assert.equal((await request(`${transportUrl}/${unscheduledTransportId}`, "DELETE")).status, 200);
        const todaySupplierQueue = await getSupplierQueue("?type=transport&dateFilter=today");
        assert.equal(todaySupplierQueue.summary.transport, 1);
        assert.equal(todaySupplierQueue.summary.today, 1);
        assert.equal(todaySupplierQueue.total, 1);
        assert.equal(todaySupplierQueue.items[0].title, "CI Airport Transfer");
        const transportContactUrl = `http://127.0.0.1:5000/api/bookings/${booking._id}/supplier-contacts/transport/${pendingTransportId}`;
        const loggedTransport = await request(transportContactUrl, "POST", {
            channel: "WhatsApp", note: "Chauffeur details pending", nextFollowUpDate: null,
        });
        assert.equal(loggedTransport.status, 200, `Transport contact: ${await loggedTransport.clone().text()}`);
        assert.equal((await loggedTransport.json()).contacts[0].channel, "WhatsApp");
        assert.equal((await getSupplierQueue("?type=transport&dateFilter=noDue")).items[0].lastContactChannel, "WhatsApp");
        assert.equal((await getSupplierQueue("?type=transport&dateFilter=today")).total, 0);
        assert.equal((await Booking.findById(booking._id)).transportAssignments.id(pendingTransportId).followUpDate, null);
        assert.equal((await request(`${transportUrl}/${pendingTransportId}`, "PUT", { status: "Confirmed" })).status, 200);
        assert.equal((await request(transportContactUrl, "POST", { channel: "Email", nextFollowUpDate: null })).status, 409);
        assert.equal((await getSupplierQueue()).total, 0);
        assert.equal(await ownAttention(), undefined);
        assert.equal((await request(`${transportUrl}/${pendingTransportId}`, "DELETE")).status, 200);

        const otherTask = await request(url, "POST", { title: "Other agent only", assignedTo: String(otherAdmin._id) });
        assert.equal(otherTask.status, 201);
        const otherTaskId = (await otherTask.json()).tasks[0]._id;
        assert.equal((await getMine()).total, 0);
        assert.equal((await getMine("", otherToken)).items[0].title, "Other agent only");
        assert.equal((await getMine("", otherToken)).items[0].priority, "Normal");
        assert.equal((await request(`${url}/${otherTaskId}`, "DELETE")).status, 200);

        const firstTransportResponse = await request(transportUrl, "POST", {
            route: "Airport pickup and round tour", startDate: dateOnly(travelStart),
            endDate: dateOnly(hotelCheckout), registration: "WP-CAB 1234",
            vehicleDescription: "KDH van", chauffeurName: "CI Chauffeur", status: "Confirmed",
            flight: { direction: "Arrival", number: "ul504", date: dateOnly(travelStart), time: "04:30", airport: "CMB", terminal: "Arrivals" },
        });
        const firstTransportText = await firstTransportResponse.text();
        assert.equal(firstTransportResponse.status, 201, `Add transport: ${firstTransportText}`);
        const firstTransport = JSON.parse(firstTransportText);
        assert.equal(firstTransport.conflicts.length, 0);
        assert.equal(firstTransport.assignments[0].flight.number, "UL504");
        const savedFlight = (await Booking.findById(booking._id)).transportAssignments[0].flight;
        assert.equal(savedFlight.time, "04:30");
        assert.equal(dateOnly(savedFlight.date), dateOnly(travelStart));
        const flightPreserved = await request(`${transportUrl}/${firstTransport.assignments[0]._id}`, "PUT", { chauffeurPhone: "+94771111111" });
        assert.equal(flightPreserved.status, 200, "Updating transport should preserve flight details");
        assert.equal((await flightPreserved.json()).assignments[0].flight.number, "UL504");
        assert.equal((await Booking.findById(booking._id)).transportAssignments[0].registrationKey, "WPCAB1234");

        // A late-night pickup belongs to the pickup day, even when the flight is next morning.
        const transferId = firstTransport.assignments[0]._id;
        const nextFlightDay = dateOnly(new Date(travelStart.getTime() + dayMs));
        const overnightFlight = await request(`${transportUrl}/${transferId}`, "PUT", {
            pickupTime: "23:00", notes: "Private transfer note",
            flight: { direction: "Departure", number: "UL505", date: nextFlightDay, time: "02:00", airport: "CMB" },
        });
        assert.equal(overnightFlight.status, 200);
        const guestMessageUrl = `${transportUrl}/${transferId}/guest-message`;
        const contactLogCount = await ActivityLog.countDocuments({ relatedRecordId: booking._id });
        const guestMessageResponse = await request(guestMessageUrl, "GET");
        assert.equal(guestMessageResponse.status, 200);
        assert.equal(guestMessageResponse.headers.get("cache-control"), "no-store");
        const guestMessage = await guestMessageResponse.json();
        assert.equal(guestMessage.number, "+94771234567");
        assert.match(guestMessage.message, /Pickup time: 23:00/);
        assert.match(guestMessage.message, /Departure flight: UL505/);
        assert.match(guestMessage.message, /Chauffeur phone: \+94771111111/);
        assert.ok(guestMessage.missingDetails.includes("Meeting point"));
        assert.equal(JSON.stringify(guestMessage).includes("Private transfer note"), false);
        assert.equal(await ActivityLog.countDocuments({ relatedRecordId: booking._id }), contactLogCount, "A draft must not log guest contact");
        const getTransfers = async (start, end = start, extra = "") => {
            const response = await request(`http://127.0.0.1:5000/api/bookings/airport-transfers?startDate=${start}&endDate=${end}${extra}`, "GET");
            const body = await response.json();
            assert.equal(response.status, 200, JSON.stringify(body));
            return body;
        };
        const pickupSchedule = await getTransfers(dateOnly(travelStart));
        const pickupItem = pickupSchedule.items.find((item) => item._id === transferId);
        assert.ok(pickupItem, "Overnight departure must appear on its pickup date");
        assert.equal(pickupItem.flight.date.slice(0, 10), nextFlightDay);
        assert.equal(pickupItem.pickupTime, "23:00");
        assert.equal(pickupItem.chauffeurPhone, "+94771111111");
        for (const field of ["notes", "totalPrice", "customer", "transportAssignments"]) assert.equal(pickupItem[field], undefined);
        assert.ok(!(await getTransfers(nextFlightDay)).items.some((item) => item._id === transferId));
        assert.ok(!(await getTransfers(dateOnly(travelStart), dateOnly(travelStart), "&direction=Arrival")).items.some((item) => item._id === transferId));
        assert.ok(!(await getTransfers(dateOnly(travelStart), dateOnly(travelStart), "&chauffeur=missing")).items.some((item) => item._id === transferId));

        // Fixtures exercise sorting, missing details, filtering, and pagination in real MongoDB.
        const scheduleFixtures = Array.from({ length: 22 }, (_, index) => ({
            _id: new mongoose.Types.ObjectId(), route: "CI Schedule " + index,
            startDate: new Date(dateOnly(travelStart)), endDate: new Date(dateOnly(travelStart)),
            status: "Requested", pickupTime: index === 0 ? "06:00" : "",
            chauffeurName: "", notes: "Private fixture note",
            flight: { direction: "Arrival", number: "CI" + index, date: new Date(dateOnly(travelStart)), time: "05:00" },
        }));
        const cancelledFixture = { ...scheduleFixtures[0], _id: new mongoose.Types.ObjectId(), status: "Cancelled" };
        const noFlightFixture = { ...scheduleFixtures[0], _id: new mongoose.Types.ObjectId(), flight: null };
        const fixtureIds = [...scheduleFixtures, cancelledFixture, noFlightFixture].map((item) => item._id);
        await Booking.updateOne({ _id: booking._id }, { $push: { transportAssignments: { $each: [...scheduleFixtures, cancelledFixture, noFlightFixture] } } });
        const requestedSchedule = await getTransfers(dateOnly(travelStart), dateOnly(travelStart), "&status=Requested&chauffeur=missing");
        assert.equal(requestedSchedule.total, 22);
        assert.equal(requestedSchedule.items.length, 20);
        assert.equal(requestedSchedule.totalPages, 2);
        assert.equal(requestedSchedule.summary.missingChauffeur, 22);
        assert.equal(requestedSchedule.summary.missingPickupTime, 21);
        assert.equal(requestedSchedule.items[0]._id, String(scheduleFixtures[0]._id), "Known pickup times sort before missing times");
        const schedulePage2 = await getTransfers(dateOnly(travelStart), dateOnly(travelStart), "&status=Requested&chauffeur=missing&page=2");
        assert.equal(schedulePage2.items.length, 2);
        assert.equal(new Set([...requestedSchedule.items, ...schedulePage2.items].map((item) => item._id)).size, 22);
        const combinedSchedule = await getTransfers(dateOnly(travelStart), dateOnly(travelStart));
        assert.equal(combinedSchedule.total, 23, "Cancelled assignments and assignments without flights stay out of the schedule");
        assert.equal(combinedSchedule.items[1]._id, transferId, "Pickups sort by pickup time");
        const originalStatus = (await Booking.findById(booking._id)).bookingStatus;
        for (const hiddenStatus of ["Completed", "Cancelled"]) {
            await Booking.updateOne({ _id: booking._id }, { $set: { bookingStatus: hiddenStatus } });
            assert.ok(!(await getTransfers(dateOnly(travelStart))).items.some((item) => item.bookingId === String(booking._id)));
        }
        await Booking.updateOne({ _id: booking._id }, {
            $set: { bookingStatus: originalStatus },
            $pull: { transportAssignments: { _id: { $in: fixtureIds } } },
        });

        const briefHotel = await request(hotelsUrl, "POST", {
            hotelName: "CI Departure Hotel", checkInDate: dateOnly(travelStart),
            checkOutDate: dateOnly(hotelCheckout), rooms: 1, status: "Confirmed",
            confirmationNumber: "CI-OPS-123",
        });
        assert.equal(briefHotel.status, 201);
        const voucherStay = (await briefHotel.json()).hotelStays.find((stay) => stay.confirmationNumber === "CI-OPS-123");
        assert.ok(voucherStay);
        const voucherResponse = await request(`http://127.0.0.1:5000/api/booking-pdf/hotel-voucher/${booking._id}/${voucherStay._id}`, "POST", {});
        assert.equal(voucherResponse.status, 200, `Hotel voucher: ${voucherResponse.statusText}`);
        assert.match(voucherResponse.headers.get("content-type"), /application\/pdf/);
        assert.equal(voucherResponse.headers.get("cache-control"), "no-store");
        assert.equal((await PDFDocument.load(await voucherResponse.arrayBuffer())).getPageCount(), 1);
        assert.ok(await ActivityLog.exists({ relatedRecordId: booking._id, "metadata.documentType": "Hotel Voucher", "metadata.stayId": voucherStay._id }));
        const briefResponse = await request(`http://127.0.0.1:5000/api/booking-pdf/operations-brief/${booking._id}`, "POST", {});
        assert.equal(briefResponse.status, 200);
        assert.match(briefResponse.headers.get("content-type"), /application\/pdf/);
        assert.equal(briefResponse.headers.get("cache-control"), "no-store");
        assert.ok((await PDFDocument.load(await briefResponse.arrayBuffer())).getPageCount() >= 1);
        assert.ok(await ActivityLog.exists({ relatedRecordId: booking._id, "metadata.documentType": "Operations Brief" }));
        const guestItineraryUrl = `http://127.0.0.1:5000/api/booking-pdf/guest-itinerary/${booking._id}`;
        const guestPdfResponse = await request(guestItineraryUrl, "POST", {});
        assert.equal(guestPdfResponse.status, 200, `Guest itinerary: ${guestPdfResponse.statusText}`);
        assert.match(guestPdfResponse.headers.get("content-type"), /application\/pdf/);
        assert.equal(guestPdfResponse.headers.get("cache-control"), "no-store");
        assert.ok((await PDFDocument.load(await guestPdfResponse.arrayBuffer())).getPageCount() >= 1);
        assert.ok(await ActivityLog.exists({ relatedRecordId: booking._id, "metadata.documentType": "Guest Itinerary" }));
        assert.ok(await ActivityLog.exists({ relatedRecordId: booking._id, description: /Itinerary entry updated/ }));
        assert.equal((await request(`${itineraryUrl}/${itineraryDay._id}`, "DELETE")).status, 200);
        assert.equal((await (await request(itineraryUrl, "GET")).json()).days.length, 0);
        tourPackage = await TourPackage.create({
            title: `CI Package Import ${Date.now()}`, overview: "CI itinerary import fixture", priceFrom: 100,
            durationDays: 3, itinerary: [
                { day: 3, title: "CI Temple visit", description: "Visit the temple" },
                { day: 1, title: "CI Arrival", description: "Airport pickup" },
            ],
        });
        await Booking.updateOne({ _id: booking._id }, { $set: { selectedPackage: tourPackage._id } });
        const previewUrl = `${itineraryUrl}/package-preview?startDate=${dateOnly(travelStart)}`;
        const packagePreview = await request(previewUrl, "GET");
        assert.equal(packagePreview.status, 200, `Package preview: ${await packagePreview.clone().text()}`);
        const preview = await packagePreview.json();
        assert.deepEqual(preview.days.map((day) => day.title), ["CI Arrival", "CI Temple visit"]);
        const packageImport = await request(`${itineraryUrl}/import-package`, "POST", {
            startDate: dateOnly(travelStart), previewToken: preview.previewToken,
        });
        assert.equal(packageImport.status, 201, `Package import: ${await packageImport.clone().text()}`);
        assert.equal((await packageImport.json()).importedCount, 2);
        assert.equal((await Booking.findById(booking._id)).itineraryDays.length, 2);
        assert.ok(await ActivityLog.exists({ relatedRecordId: booking._id, description: /Package itinerary imported/ }));
        assert.equal((await request(`${itineraryUrl}/import-package`, "POST", {
            startDate: dateOnly(travelStart), previewToken: preview.previewToken,
        })).status, 409);
        const importedPdf = await request(guestItineraryUrl, "POST", {});
        assert.equal(importedPdf.status, 200, `Imported guest itinerary: ${importedPdf.statusText}`);
        assert.match(importedPdf.headers.get("content-type"), /application\/pdf/);
        assert.ok((await PDFDocument.load(await importedPdf.arrayBuffer())).getPageCount() >= 1);
        const importedDays = (await (await request(itineraryUrl, "GET")).json()).days;
        for (const day of importedDays) assert.equal((await request(`${itineraryUrl}/${day._id}`, "DELETE")).status, 200);
        assert.equal((await request(guestItineraryUrl, "POST", {})).status, 409);

        overlappingBooking = await Booking.create({
            customer: { fullName: "CI Second Guest", email: "second@example.invalid", whatsappNumber: "+94771234568", country: "UK" },
            travelStartDate: new Date(dateOnly(travelStart)), travelEndDate: new Date(dateOnly(travelEnd)),
            numberOfTravelers: 2, totalPrice: 1000,
        });
        const otherTransportUrl = `http://127.0.0.1:5000/api/bookings/${overlappingBooking._id}/transport-assignments`;
        const secondTransportResponse = await request(otherTransportUrl, "POST", {
            route: "Day tour", startDate: dateOnly(hotelCheckout), endDate: dateOnly(hotelCheckout),
            registration: "WP CAB-1234", status: "Confirmed",
        });
        const secondTransportText = await secondTransportResponse.text();
        assert.equal(secondTransportResponse.status, 201, `Add overlapping transport: ${secondTransportText}`);
        const secondTransport = JSON.parse(secondTransportText);
        assert.equal(secondTransport.conflicts[0].bookings[0].bookingCode, booking.bookingCode);
        assert.equal((await (await request(transportUrl, "GET")).json()).conflicts[0].bookings[0].bookingCode, overlappingBooking.bookingCode);

        const editedTransport = await request(`${otherTransportUrl}/${secondTransport.assignments[0]._id}`, "PUT", { registration: "WP-OTHER 999" });
        assert.equal(editedTransport.status, 200);
        assert.equal((await editedTransport.json()).conflicts.length, 0);
        assert.equal((await (await request(transportUrl, "GET")).json()).conflicts.length, 0);
        const flightCleared = await request(`${transportUrl}/${firstTransport.assignments[0]._id}`, "PUT", { flight: null });
        assert.equal(flightCleared.status, 200);
        assert.equal((await flightCleared.json()).assignments[0].flight, null);
        assert.equal((await request(`${transportUrl}/${firstTransport.assignments[0]._id}`, "DELETE")).status, 200);

        const historyUrl = `http://127.0.0.1:5000/api/bookings/${booking._id}/activity`;
        await ActivityLog.create({
            action: "CREATE", module: "Payment", description: "CI payment received",
            relatedRecordId: new mongoose.Types.ObjectId(), relatedModel: "BookingPayment",
            metadata: { bookingId: booking._id, amount: 100 },
        });
        await ActivityLog.create({
            action: "CREATE", module: "Other", description: "Supplier cost entry created for CI booking",
            relatedRecordId: booking._id, relatedModel: "Booking",
        });
        const salesHistoryResponse = await request(historyUrl, "GET");
        assert.equal(salesHistoryResponse.status, 200);
        const salesHistory = await salesHistoryResponse.json();
        assert.ok(salesHistory.events.some((event) => event.description.includes("Preparation task")));
        assert.ok(salesHistory.events.some((event) => event.description.includes("Hotel")));
        assert.ok(salesHistory.events.some((event) => event.description.includes("Transport")));
        assert.equal(salesHistory.events.some((event) => event.module === "Payment"), false);
        assert.equal(salesHistory.events.some((event) => event.module === "Other"), false);

        await Admin.findByIdAndUpdate(otherAdmin._id, { $addToSet: { customPermissions: "payment.view" } });
        const paymentHistoryResponse = await fetch(historyUrl, { headers: { Authorization: `Bearer ${otherToken}` } });
        assert.equal(paymentHistoryResponse.status, 200);
        const paymentHistory = await paymentHistoryResponse.json();
        assert.ok(paymentHistory.events.some((event) => event.description === "CI payment received"));
        assert.equal(paymentHistory.events.some((event) => event.module === "Other"), false);
        assert.equal("metadata" in paymentHistory.events[0], false);
        assert.equal((await request("http://127.0.0.1:5000/api/bookings/not-an-id/activity", "GET")).status, 400);

        const balancesUrl = "http://127.0.0.1:5000/api/bookings/outstanding-balances";
        assert.equal((await request(balancesUrl, "GET")).status, 403);
        const attentionUrl = "http://127.0.0.1:5000/api/bookings/payment-attention";
        assert.equal((await request(attentionUrl, "GET")).status, 403);
        const getPaymentAttention = async () => {
            const response = await fetch(attentionUrl, { headers: { Authorization: `Bearer ${otherToken}` } });
            const body = await response.json();
            assert.equal(response.status, 200, `Payment alerts: ${JSON.stringify(body)}`);
            return body;
        };
        const getBalanceQueue = async (filters = "dateFilter=next30") => {
            const response = await fetch(`${balancesUrl}?${filters}`, {
                headers: { Authorization: `Bearer ${otherToken}` },
            });
            const body = await response.json();
            assert.equal(response.status, 200, `Balance queue: ${JSON.stringify(body)}`);
            return body;
        };
        const getBalances = async () => (await getBalanceQueue()).items.find((item) => String(item._id) === String(booking._id));
        assert.equal((await getBalances()).balance, 1000);
        assert.ok((await getBalanceQueue("dateFilter=all&dueFilter=unscheduled")).items.some((item) => String(item._id) === String(booking._id)));
        await Admin.findByIdAndUpdate(otherAdmin._id, { $addToSet: { customPermissions: "payment.update" } });
        const dueUrl = `http://127.0.0.1:5000/api/bookings/${booking._id}/payment-due-date`;
        const overdueDate = dateOnly(new Date(Date.now() - dayMs));
        const dueResponse = await fetch(dueUrl, {
            method: "PATCH", headers: { Authorization: `Bearer ${otherToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ paymentDueDate: overdueDate }),
        });
        assert.equal(dueResponse.status, 200, `Set payment due date: ${await dueResponse.text()}`);
        assert.ok((await getBalanceQueue("dateFilter=all&dueFilter=overdue")).items.some((item) => String(item._id) === String(booking._id)));
        assert.equal(dateOnly(new Date((await getBalances()).paymentDueDate)), overdueDate);
        assert.equal((await getPaymentAttention()).summary.overdue, 1);
        assert.equal((await request(dueUrl, "PATCH", { paymentDueDate: null })).status, 403);
        const clearResponse = await fetch(dueUrl, {
            method: "PATCH", headers: { Authorization: `Bearer ${otherToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ paymentDueDate: null }),
        });
        assert.equal(clearResponse.status, 200);
        assert.equal((await getBalances()).paymentDueDate, null);
        const contactUrl = `http://127.0.0.1:5000/api/bookings/${booking._id}/payment-contact`;
        const contacted = await fetch(contactUrl, {
            method: "PATCH", headers: { Authorization: `Bearer ${otherToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ channel: "WhatsApp", nextFollowUpDate: overdueDate }),
        });
        assert.equal(contacted.status, 200, `Log payment contact: ${await contacted.text()}`);
        const dueFollowUps = await getBalanceQueue("dateFilter=all&contactFilter=due");
        assert.equal(dueFollowUps.summary.followUpsDue, 1);
        const followUpAttention = await getPaymentAttention();
        assert.equal(followUpAttention.summary.total, 1);
        assert.equal(followUpAttention.summary.followUpsDue, 1);
        assert.ok(dueFollowUps.items.some((item) => String(item._id) === String(booking._id)));
        assert.equal((await getBalances()).contactChannel, "WhatsApp");
        assert.equal(dateOnly(new Date((await getBalances()).nextFollowUpDate)), overdueDate);
        const restoreDue = await fetch(dueUrl, {
            method: "PATCH", headers: { Authorization: `Bearer ${otherToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ paymentDueDate: overdueDate }),
        });
        assert.equal(restoreDue.status, 200);
        const overlappingAttention = await getPaymentAttention();
        assert.deepEqual(overlappingAttention.summary, { total: 1, followUpsDue: 1, overdue: 1 });
        assert.equal(overlappingAttention.items[0].followUpDue, true);
        assert.equal(overlappingAttention.items[0].paymentOverdue, true);
        assert.equal((await request(contactUrl, "PATCH", { channel: "Phone" })).status, 403);
        assert.equal((await (await request(historyUrl, "GET")).json()).events.some((event) => event.description.includes("Payment contact")), false);
        const contactHistory = await (await fetch(historyUrl, { headers: { Authorization: `Bearer ${otherToken}` } })).json();
        assert.ok(contactHistory.events.some((event) => event.description.includes("Payment contact logged")));
        await Admin.findByIdAndUpdate(otherAdmin._id, { $addToSet: { customPermissions: "payment.create" } });
        for (const amount of [400, 600]) {
            const paymentResponse = await fetch("http://127.0.0.1:5000/api/booking-payments", {
                method: "POST",
                headers: { Authorization: `Bearer ${otherToken}`, "Content-Type": "application/json" },
                body: JSON.stringify({ booking: booking._id, amount, currency: "USD", status: "Received" }),
            });
            assert.equal(paymentResponse.status, 201, `Record payment: ${await paymentResponse.text()}`);
            assert.equal((await getBalances())?.balance, amount === 400 ? 600 : undefined);
        }

        assert.equal((await getBalanceQueue("dateFilter=all&contactFilter=due")).summary.followUpsDue, 0);
        assert.equal((await getPaymentAttention()).summary.total, 0);
        console.log("Quotation validity, booking preparation, package itinerary import, supplier confirmations, payment alerts and follow-ups, transport overlaps, PDFs, dashboard attention, assigned tasks, and booking history smoke tests passed against MongoDB.");
    } finally {
        if (booking) {
            await BookingPayment.deleteMany({ booking: booking._id });
            await ActivityLog.deleteMany({ $or: [
                { relatedRecordId: booking._id },
                { "metadata.bookingId": booking._id },
            ] });
            await Booking.deleteOne({ _id: booking._id });
        }
        if (overlappingBooking) {
            await ActivityLog.deleteMany({ relatedRecordId: overlappingBooking._id });
            await Booking.deleteOne({ _id: overlappingBooking._id });
        }
        if (tourPackage) await TourPackage.deleteOne({ _id: tourPackage._id });
        if (quotation) {
            await ActivityLog.deleteMany({ relatedRecordId: quotation });
            await Quotation.deleteOne({ _id: quotation });
        }
        if (admin) await Admin.deleteOne({ _id: admin._id });
        if (otherAdmin) await Admin.deleteOne({ _id: otherAdmin._id });
        await mongoose.disconnect();
    }
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
