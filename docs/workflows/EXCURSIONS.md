# Activities & Excursions

[Feature guide](../../PROJECT_FEATURES.md) · [Bookings](BOOKINGS.md) · [Supplier directory](SUPPLIER_DIRECTORY.md)

Open **Activities & Excursions** in the side menu, or use the same link under a booking reference in **Bookings**. Search for a booking, select it, and choose **Add activity**.

## Plan and confirm an experience

1. Choose Safari, Whale watching, Train, Cooking class, Guide, or Other. Enter the activity name, date and participant count. Dates must fall within the booking and participants cannot exceed its traveler count.
2. Enter supplier details or copy a contact from the supplier directory. The saved contact is a snapshot; later directory edits do not change the reservation. Search shows up to 20 matching active suppliers; narrow the search if needed.
3. Add Sri Lanka start time, meeting point, guest instructions, internal notes and an optional follow-up date on or before the activity. Notes are single-line fields; internal notes never enter generated messages.
4. Use **Supplier request draft**, review it and send it through your email app. Then **Record request sent**, acknowledging the action.
5. When the supplier confirms, choose **Record supplier confirmation** and enter their reference. Supplier, time and meeting point are required.
6. Use **Guest instructions draft** for the confirmed details. Enter and review the guest recipient. Drafts can be copied or opened in an email app; the CRM does not automatically send them or change status.
7. After the activity date arrives, **Mark completed** when the service has actually finished. Completion cannot be recorded for a future date.

Editing a confirmed activity's name, type, date, start time, participants, supplier name or meeting point returns it to **Requested** and clears its old confirmation reference. Ask the supplier to reconfirm before sharing new guest instructions.

## Supplier replies and contact history

**Supplier Confirmations → Activities** lists Requested activities on Pending, Confirmed and In Progress bookings across **all trip dates**. A safari four months away can appear in **Due now** when its follow-up is due today. Other activity statuses are excluded. Use the activity schedule for cancellation requests and Cancellation Review for cancelled bookings.

- Choose **Review activity** to open the exact reservation, prepare its supplier request draft or record the supplier's confirmation.
- After a real email, WhatsApp message, phone call or other contact, choose **Log contact** in the queue or **Log supplier contact** on the activity. Record the channel, an optional private note and the next follow-up date.
- Next follow-up must be today or later in Sri Lanka and on or before the activity date. Leave it blank to clear the reminder. A past activity can still have contact recorded with no future reminder.
- The queue shows the latest contact time and channel. **Supplier contact history** retains the latest 50 contacts with the staff member, time, note and next follow-up. History remains readable after the reservation is confirmed or the booking closes.
- The top-bar **Suppliers** alert includes due activity requests and links directly to each activity. Saving contact or changing an activity refreshes the alert. Confirmation removes the request from this queue and clears its reminder.
- Contact logging requires `booking.view` and `booking.update`, a Requested activity and an active booking. It checks the activity revision and increments it atomically: an older editor or contact form must reload after another staff member changes the record.

Logging contact does not send a message, confirm a reservation or change a payment. Private contact notes are excluded from queue rows, booking audit events, guest drafts and travel documents. Existing records need no migration.

## Status and cancellation

| Current state | Available next states |
| --- | --- |
| Planned | Requested; Cancelled with a reason |
| Requested | Confirmed; Cancellation requested with a reason |
| Confirmed | Completed; Cancellation requested with a reason |
| Cancellation requested | Cancelled with supplier acknowledgement |
| Cancelled | Planned with a reason, if the booking is open and details fit the trip |
| Completed | Final; no further edits |

Prepare **Cancellation draft** while the reservation is Requested or Confirmed. After sending it, record the cancellation request. Mark Cancelled only after supplier acknowledgement. Drafting a cancellation never changes the reservation.

Closing or cancelling the booking does not contact suppliers or cancel activities. Closed bookings allow cancellation follow-up; completed bookings also allow recording completion of already confirmed activities. Booking deletion is blocked when any activity history exists. Cancelled activities may be edited while the booking is open, then reopened after checking dates and participants.

**Cancellation Review** includes cancelled trips with Planned, Requested, Confirmed or Cancellation requested activities, even when all hotel/transport reservations are closed. **Review activity** opens and highlights that exact record. Close an unsent Planned activity with a reason; for requested/confirmed reservations, prepare the cancellation draft, contact the supplier, record Cancellation requested and then their acknowledgement. Completed and Cancelled activities are excluded from the open count. This queue has no activity date cutoff, so older or future trips remain visible until resolved.

## Operations schedule

The schedule defaults to the next seven activity dates. Choose a range of up to 31 days, activity status and an attention filter:

- **Follow-up due:** Planned, Requested or Cancellation requested activities whose follow-up date is today or earlier in Sri Lanka.
- **Missing arrangements:** supplier, time or meeting point is missing.
- **Cancellation follow-up:** cancellation requested, or outstanding activities on a cancelled booking.

Filters apply within the selected **activity date range**, including the follow-up filter. Select future trip dates to review advance arrangements. Counts cover the full filtered result; the table displays 25 activities per page. Open an activity's booking directly from its row.

## Controls and scope

- Departure Readiness counts pending confirmations, incomplete confirmed details, outstanding cancellation requests and due follow-ups. Use **Review activities** to resolve the booking's outstanding arrangements. Completed/cancelled records are excluded from readiness warnings.
- The booking's detailed readiness review also checks activity dates, participant count, time, operator, meeting point and confirmation reference. The internal operations brief includes non-cancelled activities with clear status labels, operator phone numbers and guest instructions; private activity notes and supplier emails remain excluded.

- Read access: `booking.view`. Changes and message drafts: `booking.view` plus `booking.update`. Directory lookup additionally needs `supplier.view`.
- Up to 60 activity records per booking. The latest 50 events per activity show actor, date, state and reason. Activity records cannot be deleted through this workflow.
- Every write checks `expectedVersion` plus current trip dates, headcount and booking state. Conflicts require a reload. General booking edits cannot shrink dates/headcount past an active activity, and conflicting changes fail safely.
- Supplier costs, invoices, payments and refunds remain in **Cost & Profit**; activity status never creates a financial transaction.
- This module has reviewed text/email drafts. Confirmed and completed activities also appear in the [Guest Travel Pack](GUEST_TRAVEL_PACK.md); the original itinerary-only PDF is unchanged. Emails are not sent automatically.
- No migration is required: existing bookings start with an empty activity list and revision zero.

## API

All routes are authenticated under `/api/bookings`, return `Cache-Control: no-store`, and use the permissions above.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/excursion-schedule` | `from`, `to` (YYYY-MM-DD), `status` (active/all/a named state), `attention` (all/followup/missing/cancellation), `page` |
| GET | `/:id/excursions` | Booking summary, activity items and version |
| POST | `/:id/excursions` | Create a Planned activity |
| PUT | `/:id/excursions/:excursionId` | Replace editable details; no status or history injection |
| PATCH | `/:id/excursions/:excursionId/status` | Record an explicitly acknowledged transition |
| GET | `/:id/excursions/:excursionId/message` | Draft with `audience=supplier`, `guest`, or `cancellation` |
| GET | `/supplier-confirmations?type=activity` | Pending replies across all activity dates; filters `dateFilter=all/actionable/overdue/today/upcoming/noDue` and `page` |
| GET / POST | `/:id/supplier-contacts/activity/:excursionId` | Read contact history or record actual contact; POST requires the returned `version` as `expectedVersion` |

Create/update body:

```json
{
  "expectedVersion": 0,
  "title": "Yala morning safari",
  "type": "Safari",
  "date": "2027-03-05",
  "startTime": "05:30",
  "participants": 2,
  "supplierName": "Example Jeep Provider",
  "supplierEmail": "reservations@example.com",
  "supplierPhone": "+94771234567",
  "meetingPoint": "Hotel lobby",
  "followUpDate": "2027-03-01",
  "guestInstructions": "Bring a hat and drinking water.",
  "internalNotes": "Review supplier terms before confirming."
}
```

Status body includes `expectedVersion`, `status`, `confirmed: true`, optional `note` (required for cancellation/reopening), and `confirmationReference` when confirming. Writes return the refreshed booking summary, items and version. Invalid input returns 400, missing/scoped records 404, stale/closed records 409, and missing permissions 403.

Contact POST body: `expectedVersion`, `channel` (Email, WhatsApp, Phone or Other), optional `note` (up to 300 characters), and required `nextFollowUpDate` (YYYY-MM-DD or null to clear). The contact response includes the current `version`; stale writes return 409 and invalid/missing revisions return 400.

Verification: `node --test test/excursions.test.js test/activitySupplierContacts.test.js test/supplierConfirmations.test.js` from `backend`; CI also runs `scripts/smoke-excursions.js` and `scripts/smoke-activity-followups.js` against disposable MongoDB and the running API.
