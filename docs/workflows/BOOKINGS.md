# Bookings and operations

[Project overview](../../README.md) · [Feature index](../../PROJECT_FEATURES.md) · [API reference](../../API_DOCUMENTATION.md)

Plan the travelers, accommodation, transport and preparation work for each booking. For ongoing issues and feedback, see [Guest care](GUEST_CARE.md).

## Contents

- [Booking records and travelers](#booking-records-and-travelers)
- [Team handovers](#team-handovers)
- [Itinerary planning](#itinerary-planning)
- [Preparation tasks](#preparation-tasks)
- [Hotel stays and supplier contact](#hotel-stays-and-supplier-contact)
- [Hotel vouchers and rooming plans](#hotel-vouchers-and-rooming-plans)
- [Transport and airport transfers](#transport-and-airport-transfers)
- [Departure readiness and pre-arrival contact](#departure-readiness-and-pre-arrival-contact)
- [Hotel deadlines and cancellation review](#hotel-deadlines-and-cancellation-review)

## Booking records and travelers

Manage booking details and status

In **Bookings → Traveler roster**, record the actual travelers by name, separate from the booking contact. The
roster may be partial, holds at most the booked headcount (up to 60 names), and can be copied manually for an
authorized handoff. It stores names only, with no passport or identity document fields. Readiness review shows
the count and flags missing or mismatched names without displaying identities. Booking history records a
count, not the names. A stale roster edit or changed headcount requires a reload, and the booking headcount
cannot be reduced below its saved names. `GET /api/bookings/:id/travelers` requires `booking.view`; `PUT` also
requires `booking.update` and accepts `{ "travelerNames": ["Name"], "expectedVersion": 0, "expectedHeadcount":
2 }`. The response is not cached. Existing bookings begin with an empty roster.

Open a booking history to see dated staff actions across its details, preparation tasks, hotel stays, and
PDFs; payment events require payment access and supplier cost changes require cost access

View bookings in a calendar

## Team handovers

**Booking handover notes** in **Bookings → History and handover** let staff leave an append-only private team
journal without overwriting the editable Admin Notes field. Each note stores the staff member and Sri Lanka
time. The newest notes appear first, 20 at a time; up to 200 notes are allowed per booking. Notes stay out of
ordinary booking lists, detail responses and activity descriptions, while activity records that a note was
added without copying its text. Bookings with handover notes cannot be deleted; cancel them to preserve the
history. `GET /api/bookings/:id/handover-notes?page=1` requires `booking.view`; `POST` requires both
`booking.view` and `booking.update` with `{ "text": "..." }` (1–1000 characters). Responses disable caching.
Existing bookings start with an empty journal.

**Team Handovers** lists bookings with notes, most recently updated first, with filters for unread notes on
open bookings, all open bookings, and all statuses. The worklist shows the booking code, status, departure,
note count, unread count for the signed-in staff member, and last author/time; open a record to read its
private journal and add a note if permitted. Opening the first page marks only the latest note version
actually returned as read for that staff member. A note added during the acknowledgement remains unread;
earlier acknowledgements cannot move a read marker backward. Existing notes are unread until each staff member
opens them. The list is paged at 20 bookings and excludes note text, guest details and prices. `GET
/api/bookings/handover-worklist?filter=unread|active|all&page=1` and `PATCH
/api/bookings/:id/handover-notes/seen` with `{ "latestNoteId": "..." }` require `booking.view`, disable
caching, and do not send notifications.

The **Team Handovers** sidebar count shows how many open bookings have unread notes for the signed-in staff
member. It links to the unread worklist and refreshes after a note is saved or reviewed, after booking
changes, when the CRM regains focus, and every five minutes. It uses the existing private worklist response
and does not display note text or guest details.

Download a private departure handover PDF with guest contact, named travelers, active hotels, transport, and
open tasks; prices and private notes are excluded. A missing or partial traveler roster is clearly labelled,
and the booking contact is never assumed to be in the party.

## Itinerary planning

Plan a dated, day-by-day itinerary for each booking, including activities and overnight locations; entries
appear in the internal operations brief, and trip dates cannot exclude planned entries

Preview and import the selected tour package's day plan into an empty booking itinerary, starting on a chosen
trip date; personalize imported entries before sharing

Download a branded guest itinerary PDF from the booking itinerary planner; it uses saved trip entries and
company contact details, marks pending bookings as drafts, and leaves out financial and private supplier
information

## Preparation tasks

Track an internal preparation checklist per booking for hotels, transport, guides, itineraries, or custom
tasks; assign active staff, optional due dates, task priorities, and private handoff notes

In **Bookings → Preparation**, choose relevant starter tasks and add them together. Suggested dates are 21
days before departure for accommodation, 14 for transport and guides, and three for the final guest itinerary;
dates never begin before the current Sri Lanka day. Turn off suggested dates to leave them open, then assign
owners and adjust each task. Existing titles are skipped and the 30-task limit still applies.

## Hotel stays and supplier contact

Record hotel stays, room and meal plans, confirmation status, and hotel references on each booking

Save an optional supplier email on each hotel stay. For a requested stay, use **Supplier Confirmations →
Prepare email** or **Bookings → Hotels → Prepare email** to review an editable confirmation request with the
latest saved dates, guest name, room count, room type and meal plan. Copy the details or open your email app
to send it manually. Missing supplier email or room details are highlighted; financial details, guest contact
information and internal notes are excluded. Drafting does not log supplier contact or confirm the stay. Once
the supplier replies, record its confirmation status and reference in Hotels. The draft requires both
`booking.view` and `booking.update` and is available at `GET
/api/bookings/:id/hotel-stays/:stayId/confirmation-draft` for active bookings with requested stays.

Log a supplier email, WhatsApp message, or phone call from **Supplier Confirmations** or the booking's
**Hotels** and **Transport** details. The service history records who made contact, when, the channel, a
private note, and the next follow-up date. Logging updates the queue's follow-up date and shows the latest
contact there; it does not send a message or confirm the supplier. Leave the next date blank to clear a
reminder. Dates must be today or later and no later than check-in or the transport start (Sri Lanka time). Up
to 50 recent contacts per service are kept. Staff with `booking.view` can read the history; logging needs both
`booking.view` and `booking.update`, an active booking, and a requested service. Use `GET` and `POST
/api/bookings/:id/supplier-contacts/:type/:itemId`, where `type` is `hotel` or `transport`. The queue and
booking activity log exclude private contact notes.

Review hotel night coverage in each booking to spot missing nights, reservations awaiting confirmation,
overlapping stays, and stays outside the trip dates

## Hotel vouchers and rooming plans

Download a branded hotel voucher from each confirmed stay in **Bookings → Hotels**. It includes the lead
guest, property, check-in/out dates, nights, rooms, meal plan, hotel reference, and company contact details.
Missing optional details are labelled “Not supplied”; supplier prices, payments, guest contact details, and
internal notes are excluded. The voucher is not a payment receipt. Cancelled stays/bookings cannot generate
vouchers, and each download is recorded in booking history.

For an active booking with a confirmed hotel stay and complete traveler roster, **Bookings → Hotels → Rooming
email** lets staff choose who stays at that property and assign each included person to a sharing group. Every
roster name needs a choice, and each reserved room group needs an occupant. Save the plan to reopen it later;
the editable email is prepared only from the saved, current plan. Group labels do not imply physical hotel
room numbers. Excluded travelers, guest contact details, prices and private notes are left out. Copy it or
open an email app to send manually; long drafts can be copied even if the email app link is unavailable.
Sending is manual and is not logged as supplier contact. Editing the traveler roster or room count marks the
saved plan as needing review; changing the hotel's confirmation status clears it. Booking history records plan
changes and the number assigned on saves, without storing names there. `GET
/api/bookings/:id/hotel-stays/:stayId/rooming-details` and `PUT`/`DELETE
/api/bookings/:id/hotel-stays/:stayId/rooming-plan` require `booking.view` and `booking.update`; responses
disable caching and reject stale edits.

Hotel vouchers use `POST /api/booking-pdf/hotel-voucher/:id/:stayId` with `booking.view` and `pdf.generate`
permissions. The hotel stay must belong to the booking and be confirmed. The response is a non-cacheable PDF
attachment; missing records return 404 and an unconfirmed stay or cancelled booking returns 409. The existing
hotel confirmation is independent of the tour's overall status, so confirmed stays can be printed while the
tour is pending or reprinted after completion. No automatic email is sent.

## Transport and airport transfers

Plan multiple transport legs per booking with vehicle registration, chauffeur, pickup details, and status;
flag possible date overlaps for the same confirmed vehicle

Attach arrival or departure flight numbers, scheduled dates and times, airports, and terminals to transfers;
keep pickup time separate and include flight details in the chauffeur operations PDF (Sri Lanka time)

Use **Airport Transfers** to review pickups across active bookings, filter arrivals/departures or missing
chauffeurs, and open transport details directly; the next seven days are shown by default, with date ranges up
to 31 days. The schedule uses each transport leg’s start date as its pickup date, shows flight times
separately, and includes requested/confirmed legs with saved flight details. Cancelled transfers and
completed/cancelled bookings are excluded. All times are in Sri Lanka time.

Prepare a **Guest message** from a confirmed airport transfer. The CRM reloads saved pickup, flight,
chauffeur, and vehicle details into an editable WhatsApp draft, highlights missing details, and lets staff
copy the text or open WhatsApp with a reviewed international recipient number. Private notes and financial
information are excluded. Staff send the message themselves; drafting or opening WhatsApp does not log
contact, mark a message sent, or change the booking.

Guest pickup drafts use `GET /api/bookings/:id/transport-assignments/:assignmentId/guest-message` with both
`booking.view` and `booking.update` permissions. The transfer must belong to the booking and be confirmed; the
booking must be pending, confirmed, or in progress. The response contains only the guest name/number, booking
reference, message, and missing-detail labels, and disables caching. Invalid IDs return 400, missing records
return 404, and inactive bookings or unconfirmed transfers return 409. The endpoint is read-only and does not
contact WhatsApp or send messages.

## Departure readiness and pre-arrival contact

Open **Bookings → Readiness review** on an active booking to check the latest saved guest details, itinerary
day coverage, hotel night coverage, transport confirmations and pickup details, and open/overdue/unassigned
preparation tasks. Each area links to its existing editor. Empty plans show **Not assessed** rather than a
pass; hotels may be guest-arranged, and overlapping stays may be intentional. Flight and pickup times remain
separate. The review uses Sri Lanka calendar dates, excludes financial checks, and does not change any
booking, task, or contact record. Reopen or refresh it after saving changes; completed/cancelled bookings are
not assessed.

**Departure Readiness** lists active bookings starting within 30 Sri Lanka calendar days, 20 per page. It
counts missing traveler names, pending hotel and transport confirmations, missing or stale rooming plans on
confirmed stays, and open tasks. **Review booking** opens the existing per-booking readiness review, which now
also flags missing or stale rooming plans. The queue shows counts without traveler names, room assignments,
guest contact details, notes or financial fields. A missing hotel/transport service or rooming plan may be
outside the agreed scope; the labels are prompts to review, not a final trip approval. `GET
/api/bookings/departure-readiness?page=1` requires `booking.view` and disables caching.

Activities also affect departure readiness. Planned/requested activities, outstanding cancellation requests,
due supplier follow-ups, and confirmed activities with invalid dates/headcounts or missing time, meeting point,
operator or confirmation reference require attention. Completed/cancelled activities do not create departure
warnings. The queue exposes counts only and links directly to the booking's activities. The detailed readiness
review includes an Activities & Excursions section; no recorded activities means the scope needs checking,
not that a required reservation is missing. The internal operations brief includes non-cancelled activities,
their statuses, operator phone, meeting details, reference, guest instructions and pending follow-up dates.
It excludes private activity notes, supplier emails, history and financial details.

**Pre-arrival message** on a confirmed upcoming booking in Departure Readiness prepares an editable, trip-wide
guest note with saved dates and, only when unambiguous, a confirmed first-night hotel and arrival transfer.
Missing, requested, or conflicting arrangements appear as staff review prompts instead of guest claims. Staff
can edit the recipient and message, copy the draft or open WhatsApp to send it manually. Drafting never logs
contact or changes the booking. `GET /api/bookings/:id/pre-arrival-message` requires `booking.view` and
`booking.update`, reloads the booking, returns only selected guest-facing fields, and disables caching. Past,
unconfirmed or invalid trips return 409.

**Pre-arrival sent tracking** lets staff explicitly record a message after sending it outside the CRM.
Departure Readiness shows who recorded it, the channel and Sri Lanka time, with **Awaiting note** and **Note
recorded** filters. Copying or opening WhatsApp never marks it sent. An incorrect record can be cleared with a
reason; both actions are audited, and stale or duplicate updates are rejected. `PATCH
/api/bookings/:id/pre-arrival-message/contact` requires `booking.view` and `booking.update`, an
`expectedRevision`, and either `{ "action": "sent", "channel": "WhatsApp" | "Email" | "Other" }` or `{
"action": "clear", "reason": "..." }`. The departure queue accepts `?message=all|unsent|sent` and exposes only
the sent timestamp, staff name and channel, not the message text or guest number.

**Pre-arrival reminders** show a small count beside Departure Readiness when confirmed bookings start within
three Sri Lanka calendar days and have no recorded note. The badge links to a **Due within 3 days** queue
filter. It refreshes after a sent record or correction, when staff return to the app, and every five minutes.
`GET /api/bookings/departure-readiness/alerts` requires `booking.view` and `booking.update`, disables caching,
and returns the total and at most five booking references and departure dates, without guest contact or
message text. The queue also accepts `?message=due`; these reminders do not send messages or create contact
records.

## Hotel deadlines and cancellation review

Save an optional hotel cancellation cutoff date and the supplier's terms on each stay. **Hotel Deadlines**
lists active bookings with an upcoming check-in and a saved cutoff, including requested and confirmed stays.
Its due-soon view includes passed cutoffs, today, and the next six Sri Lanka calendar days; cancelled stays
and past check-ins leave the queue. The **Suppliers** header alert includes these due-soon cutoffs and
refreshes after hotel edits, when the CRM regains focus, and every five minutes. A date is only a reminder:
check the exact cutoff time, charges, and written terms with the hotel. `GET
/api/bookings/hotel-cancellation-deadlines` requires `booking.view`, accepts `filter=due7|overdue|later|all`
and `page`, and returns 25 stays per page without guest contact or supplier cost details.

**Cancellation Review** lists cancelled bookings with requested or confirmed hotel stays or transport legs
that still need supplier follow-up. Review each arrangement and record its individual cancellation after
contacting the supplier. The All cancelled trips view retains trips after arrangements are closed. Finance and
Super Admin also see booked paid totals, recorded receipts and refunds, and recorded supplier costs by
currency; these figures are review context, not an automatic cancellation charge or refund entitlement. The
queue omits financial fields for staff without both `payment.view` and `cost.view`. `GET
/api/bookings/cancellation-review?filter=open|all&page=1` requires `booking.view`, returns 20 bookings per
page, and uses `Cache-Control: no-store`.

When a booking enters **Cancelled**, enter a 10–300 character reason. The CRM records the staff member and
time, shows the details in Cancellation Review, and adds the reason to booking history. A cancelled booking
can still be edited without replacing its saved reason; older cancellations with no reason are labelled as
such. Reopening clears the current cancellation fields, while the earlier reason remains in activity history.
These status changes do not cancel hotel/transport arrangements or decide financial settlements.

From **Cancellation Review** or **Bookings → Hotels**, staff with booking edit access can prepare an editable
hotel cancellation email for an open stay on a cancelled trip. It uses the saved dates, room count, lead guest
and any hotel reference, asks for written confirmation and the basis of any charges, and leaves out the
private cancellation reason, supplier costs and guest contact details. Copy it or open an email app to send
manually. Drafting does not send an email, log contact, or mark the hotel stay cancelled; update the stay
after the supplier responds. `GET /api/bookings/:id/hotel-stays/:stayId/cancellation-draft` requires
`booking.view` and `booking.update`, rechecks the booking and stay, and disables caching.
