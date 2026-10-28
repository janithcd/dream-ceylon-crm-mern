import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLeadFirstResponse } from "./leadFirstResponse.js";

test("first response uses saved contact details without copying private or unconfirmed travel details", () => {
    const draft = buildLeadFirstResponse({
        fullName: "  Asha   Perera  ", email: "asha@example.com", whatsappNumber: "+94771234567",
        message: "We need a 20% discount", adminNotes: "Sensitive margin: 23%",
        travelDate: "2027-04-20", interestedPackage: { title: "Premium Safari" },
    });
    assert.equal(draft.number, "+94771234567");
    assert.equal(draft.email, "asha@example.com");
    assert.match(draft.message, /^Hello Asha Perera,/);
    assert.doesNotMatch(draft.message, /discount|margin|2027|Premium Safari/);
    assert.match(buildLeadFirstResponse({}).message, /^Hello there,/);
});
