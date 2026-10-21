import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSupplierMailtoUrl } from "./supplierEmail.js";

test("supplier email preserves reviewed multiline message and symbols in a mailto draft", () => {
    const subject = "Reservation request | DCJ-2027-1 | Laluna Bentota";
    const body = "Hello reservations,\nOne room for Ashlee & Demelza.\nThanks, Dream Ceylon Journeys";
    const url = buildSupplierMailtoUrl({ recipient: " Reservations+SL@Hotel.example ", subject, body });
    assert.ok(url.startsWith("mailto:Reservations+SL@Hotel.example?"));
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("subject"), subject);
    assert.equal(parsed.searchParams.get("body"), body);
});

test("missing, multi-recipient, newline-injected or invalid addresses cannot open an email app", () => {
    const valid = { recipient: "hotel@example.com", subject: "Request", body: "Please confirm" };
    for (const recipient of ["", "hotel@example.com,other@example.com", "hotel@example.com\nBcc:other@example.com", "hotel@example.com?subject=override", "hotel.example.com"]) {
        assert.equal(buildSupplierMailtoUrl({ ...valid, recipient }), "");
    }
    assert.equal(buildSupplierMailtoUrl({ ...valid, subject: " " }), "");
    assert.equal(buildSupplierMailtoUrl({ ...valid, body: " " }), "");
});
