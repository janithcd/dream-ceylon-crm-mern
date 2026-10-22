import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuotationComparison } from "./quotationComparison.js";

const source = {
    quotationNo: "DCJ-Q-2026-100001",
    clientName: "Ashlee",
    tourTitle: "Sri Lanka tour",
    travelStartDate: "2027-03-10T00:00:00.000Z",
    travelEndDate: "2027-03-20T00:00:00.000Z",
    travelers: 2,
    durationDays: 10,
    validUntil: "2026-11-15T00:00:00.000Z",
    status: "Sent",
    currency: "USD",
    vehicleType: "Car",
    vehicleDays: 10,
    vehicleDailyRate: 80,
    totals: {
        vehicleTotal: 800, hotelTotal: 400, activitiesTotal: 90,
        entranceFeesTotal: 0, otherTotal: 0, discount: 0,
        grandTotal: 1290, advancePayment: 645, balancePayment: 645,
    },
    inclusions: ["Driver", "Water"],
    exclusions: ["Entry tickets"],
    notes: "Private tour",
};

const findRow = (sections, label) => sections.flatMap((section) => section.rows)
    .find((row) => row.label === label);

test("comparison distinguishes intentional draft reset and Colombo calendar dates", () => {
    const revision = {
        ...source,
        quotationNo: "DCJ-Q-2026-100002",
        travelStartDate: "2027-03-10T02:00:00.000Z",
        status: "Draft",
        validUntil: null,
    };
    const sections = buildQuotationComparison(source, revision);

    assert.equal(findRow(sections, "Travel start").changed, false);
    assert.equal(findRow(sections, "Grand total").changed, false);
    assert.deepEqual([findRow(sections, "Status").changed, findRow(sections, "Offer valid until").changed], [true, true]);
    assert.equal(findRow(sections, "Offer valid until").after, "Not set");
    assert.equal(findRow(sections, "Inclusions").changed, false);
});

test("pricing in a different currency is flagged without inventing an exchange rate", () => {
    const revision = {
        ...source,
        currency: "GBP",
        totals: { ...source.totals, grandTotal: 1290 },
        inclusions: ["Driver", "Train tickets"],
    };
    const sections = buildQuotationComparison(source, revision);

    assert.equal(findRow(sections, "Currency").changed, true);
    assert.deepEqual(
        [findRow(sections, "Grand total").before, findRow(sections, "Grand total").after],
        ["USD 1,290.00", "GBP 1,290.00"]
    );
    assert.equal(findRow(sections, "Grand total").changed, true);
    assert.equal(findRow(sections, "Inclusions").changed, true);
    assert.equal(findRow(sections, "Inclusions").after, "Driver\nTrain tickets");
});
