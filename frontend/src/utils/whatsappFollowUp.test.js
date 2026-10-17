import { test } from "node:test";
import assert from "node:assert/strict";
import {
    getWhatsAppContact,
    normalizeWhatsAppNumber,
    buildWhatsAppFollowUpMessage,
    buildWhatsAppUrl,
} from "./whatsappFollowUp.js";

test("uses an entered phone or falls back to the linked quotation inquiry", () => {
    const quotationFollowUp = {
        customerContact: "client@example.com",
        quotation: { inquiry: { whatsappNumber: "+44 7700 900123" } },
    };

    assert.equal(getWhatsAppContact(quotationFollowUp), "+44 7700 900123");
    assert.equal(
        getWhatsAppContact({ ...quotationFollowUp, customerContact: "0771234567" }),
        "+44 7700 900123"
    );
    assert.equal(
        getWhatsAppContact({ ...quotationFollowUp, customerContact: "+94 77 123 4567" }),
        "+94 77 123 4567"
    );
    assert.equal(getWhatsAppContact({ customerContact: "Sri Lanka" }), "");
    assert.equal(getWhatsAppContact({ booking: { customer: { whatsappNumber: "+94771234567" } } }), "+94771234567");
});

test("requires an international phone number and encodes the editable message", () => {
    assert.equal(normalizeWhatsAppNumber("+94 (77) 123-4567"), "94771234567");
    assert.equal(normalizeWhatsAppNumber("0771234567"), "");
    assert.equal(normalizeWhatsAppNumber("client@example.com"), "");
    assert.equal(normalizeWhatsAppNumber("+94 77 123 4567 ext 3"), "");
    assert.equal(buildWhatsAppUrl("0771234567", "Hello"), "");
    assert.equal(buildWhatsAppUrl("+94771234567", "   "), "");
    assert.equal(
        buildWhatsAppUrl("+94 77 123 4567", "Hello & welcome"),
        "https://wa.me/94771234567?text=Hello%20%26%20welcome"
    );
});

test("the draft refers to the linked record but omits private notes and financial data", () => {
    const followUp = {
        customerName: "Ava",
        type: "Quotation",
        quotation: { quotationNo: "Q-42", totals: { grandTotal: 5000 } },
        notes: "Internal margin 25%",
    };
    const draft = buildWhatsAppFollowUpMessage(followUp);

    assert.match(draft, /Hello Ava,.*quotation Q-42/);
    assert.doesNotMatch(draft, /5000|margin/);
    assert.match(
        buildWhatsAppFollowUpMessage({ type: "Booking", booking: { bookingCode: "B-7" } }),
        /Hello there,.*booking B-7/
    );
});
