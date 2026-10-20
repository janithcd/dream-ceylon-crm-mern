import { test } from "node:test";
import assert from "node:assert/strict";
import { getHotelNightCoverage } from "./hotelNightCoverage.js";

const booking = {
    travelStartDate: "2027-02-27T00:00:00.000Z",
    travelEndDate: "2027-03-05T00:00:00.000Z",
};
const stay = (checkInDate, checkOutDate, status = "Confirmed", hotelName = "Hotel") => ({
    hotelName, checkInDate, checkOutDate, status,
});

test("hotel night coverage counts check-in nights but excludes check-out and cancelled stays", () => {
    const coverage = getHotelNightCoverage(booking, [
        stay("2027-02-27", "2027-03-01"),
        stay("2027-03-01", "2027-03-03", "Requested"),
        stay("2027-03-02", "2027-03-04"),
        stay("2027-03-04", "2027-03-05", "Cancelled"),
    ]);
    assert.equal(coverage.totalNights, 6);
    assert.equal(coverage.confirmedNights, 4);
    assert.equal(coverage.requestedOnlyNights, 1);
    assert.equal(coverage.missingNights, 1);
    assert.equal(coverage.multipleStayNights, 1);
    assert.deepEqual(coverage.requestedOnlyRanges, [{ from: "2027-03-01", to: "2027-03-01", nights: 1 }]);
    assert.deepEqual(coverage.missingRanges, [{ from: "2027-03-04", to: "2027-03-04", nights: 1 }]);
    assert.deepEqual(coverage.multipleStayRanges, [{ from: "2027-03-02", to: "2027-03-02", nights: 1 }]);
    assert.equal(coverage.activeStays, 3);
});

test("adjacent stays cover consecutive nights with no false overlap", () => {
    const coverage = getHotelNightCoverage(booking, [
        stay("2027-02-27", "2027-03-01"),
        stay("2027-03-01", "2027-03-05"),
    ]);
    assert.equal(coverage.confirmedNights, 6);
    assert.deepEqual(coverage.missingRanges, []);
    assert.deepEqual(coverage.multipleStayRanges, []);
});

test("nights without a stay form readable ranges and out-of-trip stays are flagged", () => {
    const coverage = getHotelNightCoverage(booking, [
        stay("2027-02-26", "2027-02-28", "Confirmed", "Early hotel"),
        stay("2027-03-06", "2027-03-07", "Requested", "Late hotel"),
    ]);
    assert.equal(coverage.confirmedNights, 1);
    assert.equal(coverage.missingNights, 5);
    assert.deepEqual(coverage.missingRanges, [{ from: "2027-02-28", to: "2027-03-04", nights: 5 }]);
    assert.deepEqual(coverage.outsideTrip.map((item) => item.hotelName), ["Early hotel", "Late hotel"]);
});

test("Sri Lanka calendar dates and transport-only bookings remain explicit", () => {
    const localBooking = {
        travelStartDate: "2027-02-26T18:30:00.000Z",
        travelEndDate: "2027-02-28T18:30:00.000Z",
    };
    const coverage = getHotelNightCoverage(localBooking, [
        stay("2027-02-27T00:00:00.000Z", "2027-03-01T00:00:00.000Z"),
    ]);
    assert.equal(coverage.totalNights, 2);
    assert.equal(coverage.confirmedNights, 2);
    assert.equal(coverage.outsideTrip.length, 0);
    const noHotel = getHotelNightCoverage(booking, []);
    assert.equal(noHotel.activeStays, 0);
    assert.equal(noHotel.missingNights, 6);
    assert.equal(getHotelNightCoverage({ ...booking, travelEndDate: booking.travelStartDate }), null);
});
