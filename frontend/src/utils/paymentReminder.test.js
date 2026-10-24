import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPaymentReminderMessage } from "./paymentReminder.js";
import { buildWhatsAppUrl } from "./whatsappFollowUp.js";
import { getGuestPaymentMilestones } from "./guestPaymentMilestones.js";

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

test("hotel advance is requested first and recorded payments or refunds change the next stage", () => {
    const plan = { ...booking, advancePayment: 100, hotelAdvanceAmount: 400,
        hotelAdvanceDueDate: "2026-10-20T00:00:00.000Z" };
    const stages = getGuestPaymentMilestones(plan);
    assert.deepEqual(stages.map(({ label, target, outstanding }) => [label, target, outstanding]), [
        ["Hotel advance", 400, 300], ["Final balance", 890, 890],
    ]);
    const beforeFinalDue = new Date("2026-10-19T00:00:00.000Z");
    const advanceDraft = buildPaymentReminderMessage(plan, beforeFinalDue);
    assert.match(advanceDraft, /hotel advance.*USD 300\.00.*Oct 20, 2026/);
    assert.match(advanceDraft, /total remaining booking balance is USD 1,190\.00/);
    assert.doesNotMatch(advanceDraft, /supplier rate/);
    const covered = { ...plan, advancePayment: 450 };
    assert.deepEqual(getGuestPaymentMilestones(covered).map(({ outstanding }) => outstanding), [0, 840]);
    assert.match(buildPaymentReminderMessage(covered, beforeFinalDue), /remaining balance.*USD 840\.00.*Oct 24, 2026/);
    assert.match(buildPaymentReminderMessage({ ...covered, advancePayment: 200 }, beforeFinalDue), /hotel advance.*USD 200\.00/);
    assert.match(buildPaymentReminderMessage(plan, new Date("2026-10-25T00:00:00.000Z")),
        /remaining balance.*USD 1,190\.00.*Oct 24, 2026/);
});
