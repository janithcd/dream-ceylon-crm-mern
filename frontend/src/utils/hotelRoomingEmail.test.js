import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHotelRoomingEmail } from "./hotelRoomingEmail.js";

const details = () => ({
    bookingCode: "DCJ-TEST", hotelName: "Seaside Hotel", checkIn: "Mar 11, 2027", checkOut: "Mar 12, 2027",
    rooms: 2, roomType: "Double", mealPlan: "Breakfast", hotelReference: "HOTEL-123",
    recipient: "hotel@example.test", companyName: "Dream Ceylon Journeys", companyEmail: "team@example.test",
    travelerNames: ["First Guest", "Second Guest", "Third Guest"],
    customerEmail: "PRIVATE_GUEST_CONTACT", totalPrice: 999,
});

test("rooming draft groups the selected guests without including excluded travelers or private booking data", () => {
    const { value } = buildHotelRoomingEmail(details(), ["1", "not-staying", "2"]);
    assert.match(value.body, /Room group 1:\n- First Guest/);
    assert.match(value.body, /Room group 2:\n- Third Guest/);
    assert.match(value.body, /not hotel room numbers/);
    assert.match(value.body, /HOTEL-123/);
    assert.ok(!JSON.stringify(value).includes("Second Guest"));
    assert.ok(!JSON.stringify(value).includes("PRIVATE"));
    assert.ok(!JSON.stringify(value).includes("999"));
});

test("every traveler needs a deliberate choice and every reserved room group an occupant", () => {
    for (const assignments of [[], ["1", "", "2"], ["1", "1", "not-staying"],
        ["not-staying", "not-staying", "not-staying"], ["1", "2", "99"], ["1", "2", "1.5"]]) {
        assert.ok(buildHotelRoomingEmail(details(), assignments).error, JSON.stringify(assignments));
    }
});
