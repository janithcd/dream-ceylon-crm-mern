import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPaymentReminderMessage } from "./paymentReminder.js";
import { buildWhatsAppUrl } from "./whatsappFollowUp.js";

const booking = {
    bookingCode: "DCJ-2026-123456",
    customer: { fullName: "  Ashlee  Reed  ", whatsappNumber: "+44 7700 900123" },
    totalPrice: 1290,
    advancePayment: 400,
    currency: "USD",
    bookingStatus: "Confirmed",
    paymentDueDate: "2026-10-24T00:00:00.000Z",
    adminNotes: "Private supplier rate USD 600",
};

test("draft uses the booking balance and Sri Lanka due date", () => {
    const message = buildPaymentReminderMessage(booking);
    assert.match(message, /Hello Ashlee Reed,.*DCJ-2026-123456.*USD 890\.00/);
    assert.match(message, /payment due date of Oct 24, 2026/);
    assert.doesNotMatch(message, /supplier rate|USD 600/);
    const url = buildWhatsAppUrl(booking.customer.whatsappNumber, message);
    assert.ok(url.startsWith("https://wa.me/447700900123?text="));
    assert.equal(new URL(url).searchParams.get("text"), message);
});

test("draft does not invent a deadline and declines settled or invalid bookings", () => {
    const unscheduled = buildPaymentReminderMessage({ ...booking, paymentDueDate: null });
    assert.doesNotMatch(unscheduled, /due date|overdue/);
    assert.equal(buildPaymentReminderMessage({ ...booking, advancePayment: 1290 }), "");
    assert.equal(buildPaymentReminderMessage({ ...booking, bookingStatus: "Cancelled" }), "");
    assert.equal(buildPaymentReminderMessage({ ...booking, currency: "XYZ" }), "");
    assert.equal(buildPaymentReminderMessage({ ...booking, totalPrice: "not a number" }), "");
});
