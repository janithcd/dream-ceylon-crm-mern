# Guest Travel Pack

[Feature guide](../../PROJECT_FEATURES.md) · [Bookings](BOOKINGS.md) · [Activities](EXCURSIONS.md)

In **Bookings**, select **Guest travel pack** beneath the booking reference. Review the warnings and the guest-facing content, acknowledge the review, then download one PDF for the client.

## Included content

| Section | Shared details |
| --- | --- |
| Trip | Lead guest name, booking reference, travel dates, traveler count and company contact details |
| Daily plans | Saved itinerary titles, plans and overnight locations, ordered by date |
| Confirmed hotels | Hotel, location, check-in/out, room count/type, meal plan and hotel reference |
| Confirmed transport | Route and service dates, pickup/drop-off, local time, vehicle/registration, chauffeur name and phone, saved flight details |
| Activities | Confirmed or completed activity details, date/time, participants, operator, meeting point, reference and guest instructions |

Only explicitly selected guest-facing fields enter the document. Supplier email addresses, private notes, payment amounts, costs, margins, tasks, contact history and rooming allocations are excluded. A chauffeur's name and phone are deliberately shared so the guest can meet their driver.

The PDF states that daily plans describe the intended itinerary; they do not confirm reservations. Pending/requested/cancellation-requested and cancelled arrangements are omitted. Completed activities remain visible on an In Progress trip, with their Completed status. The pack is not a payment receipt or an individual hotel voucher; use the separate document actions for those.

## Review rules

- Only Confirmed and In Progress bookings can generate a pack.
- A lead guest, positive traveler count, valid trip dates (up to 366 days) and at least one itinerary entry are required.
- Invalid/out-of-trip confirmed arrangements block download. A pack can contain at most 240 entries.
- Missing itinerary days, missing confirmed categories, unconfirmed arrangements and incomplete contact/meeting/reference details produce warnings. Review whether the guest has arranged these independently or information still needs entering.
- Missing details in a confirmed reservation print as **To be confirmed**. They are never silently invented.
- The preview offers shortcuts to review the itinerary, hotels, transport and activities. After editing, reopen the travel pack to review fresh content.
- Download requires a reviewed-content fingerprint. Changes to guest-facing data, status, warnings, recipient or company contact details invalidate the preview. The API checks again after rendering, so a changed booking does not produce a stale download.
- Internal notes and financial edits do not invalidate a preview because those fields are not part of this document.

## Sending to the guest

After download, open the PDF and check it. The modal provides an email draft using the booking's saved email address. Copy it or open your email app, attach the PDF manually, verify the recipient and send. The CRM does not automatically send or attach the pack and does not mark it as delivered. Update a wrong guest email in the booking and generate a fresh pack.

## Permissions and API

Both preview and download require `booking.view` and `pdf.generate`. All responses disable caching. Generation records an activity log with document type, entry counts and warning count; private reservation notes are not logged.

| Method | Endpoint | Body / result |
| --- | --- | --- |
| GET | `/api/booking-pdf/travel-pack/:id/preview` | Guest content, counts, blockers, warnings, draft email and fingerprint |
| POST | `/api/booking-pdf/travel-pack/:id` | `{ "reviewed": true, "fingerprint": "<preview fingerprint>" }`; returns PDF |

Invalid IDs/review input return 400, missing bookings 404, unavailable or changed packs 409, and missing permissions 403. No schema migration or additional package installation is needed.

Tests: `backend/test/guestTravelPack.test.js` covers privacy, validation, stale previews, changes during rendering, multilingual text and pagination. The MongoDB excursion smoke test exercises preview/download and stale rejection against persisted activity data.
