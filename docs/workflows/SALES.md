# Sales and quotations

[Project overview](../../README.md) · [Feature index](../../PROJECT_FEATURES.md) · [API reference](../../API_DOCUMENTATION.md)

Manage a lead from its first inquiry through follow-up and an accepted quotation. Dates and reminders use the Sri Lanka business calendar.

## Contents

- [Inquiries and customer records](#inquiries-and-customer-records)
- [Lead insights and ownership](#lead-insights-and-ownership)
- [First response drafts](#first-response-drafts)
- [Follow-ups](#follow-ups)
- [Quotations and validity](#quotations-and-validity)
- [Revisions and booking conversion](#revisions-and-booking-conversion)

## Inquiries and customer records

Capture and manage customer inquiries

Staff can add a manual inquiry with its real source and priority; public website submissions remain tagged
Website and cannot set private sales fields. When closing an inquiry as Cancelled, choose a loss reason and
optionally add a private note (up to 300 characters). Reopening or converting it clears those fields. Older
closed inquiries without reasons remain editable and appear as Unspecified in reports.

Search, filter, update, and delete inquiries

Build complete customer profiles

View inquiry, quotation, booking, and payment history

Export business data to CSV

## Lead insights and ownership

**Lead Insights** compares Website, social, referral, and other inquiry sources over the last 30, 90, or 365
Sri Lanka calendar days, or all time. Each period groups inquiries by creation date; a lead counts as booked
only if it has a linked booking, including a booking later cancelled. Closing an unbooked lead counts as lost.
The page shows conversion rates and loss reasons without guest details. First-contact metrics show the number
with a valid recorded contact, average elapsed response hours, the share contacted within 24 hours, and
still-New inquiries waiting 24 hours or more with no recorded contact. Only first contacts actually logged in
the CRM are counted; manually changing status does not supply a contact time. Older records with missing or
invalid contact times show no response metric. Bookings and first contacts may occur after the inquiry period,
so these are current cohort results rather than events made during that period. `GET
/api/inquiries/insights?window=30|90|365|all` requires `inquiry.view`; manual entry at `POST
/api/inquiries/manual` requires `inquiry.create`. The public `POST /api/inquiries` remains available with rate
limiting and resets submitted source, status, priority and internal fields.

**New Lead Queue** lists New inquiries oldest first, with filters for all, unassigned, and mine. Staff with
`inquiry.update` can assign an active admin who also has that permission; inactive or read-only admins cannot
own new leads. The same owner control appears on open inquiries in the main list. Once the guest has actually
been contacted, choose Email, WhatsApp, Phone, or Other and select **Record contact**. This stores the time,
channel and staff member, changes a still-New inquiry to Contacted, and assigns an unowned lead to that staff
member. It does not send a message. Reopening an inquiry keeps its first contact record; a later recorded
contact appears in activity history without replacing the original. Older inquiries with no owner or first
contact remain valid. `GET /api/inquiries/triage?filter=all|unassigned|mine&page=1` requires `inquiry.view`;
`GET /api/inquiries/assignees`, `PATCH /api/inquiries/:id/assignee` (`{ assignedTo: id|null }`) and `PATCH
/api/inquiries/:id/contacted` (`{ channel }`) require `inquiry.update`.

**Same-email history cue** in the New Lead Queue counts other inquiries with the lead's saved email, plus
bookings with that email only for staff who have `booking.view`. It uses exact normalized email matches and
does not merge, reject, or change any record. Shared addresses may belong to different travelers; open the
linked inquiry or booking search to review context. The cue shows no prior notes, prices, or booking details.
The private triage response is not cached; older records with emails stored outside the CRM's lowercase
normalization may need manual lookup.

See a header alert for new unassigned inquiries and new inquiries assigned to you; it highlights those waiting
at least 24 hours and links to the lead queue. The alert refreshes after inquiry changes, on focus, and every
minute while the CRM is open.

## First response drafts

**First response review** in the New Lead Queue opens the latest saved inquiry request, travel date, party
size and package interest without leaving the queue. Staff with `inquiry.update` can edit a generic reply and
recipient, copy the message or email details for Zoho webmail, or open their email app or WhatsApp. The draft
excludes private notes, prices and unconfirmed trip details. A WhatsApp link needs a full international
number. These actions do not send from the CRM or record contact: after actually sending, choose the channel
and select **Record contact** in the queue. View-only staff can review the request without draft actions.

## Follow-ups

Schedule and complete customer follow-ups

Identify overdue and upcoming follow-ups

**Follow-up ownership:** new reminders default to their creator; staff can assign an active admin with
`followUp.manage` or leave one unassigned. The follow-up page offers owner filters and one-click **My due
work** and **Unassigned due work** queues. Due means pending with a date on or before today in Sri Lanka. The
dashboard shows only your and unassigned reminders, with the owner displayed next to each; the main list can
still show all team reminders. Existing reminders without an owner remain unassigned. Summary cards follow the
selected owner filter. `GET /api/follow-ups?owner=all|mine|unassigned|attention|<adminId>&dateFilter=due` and
`/summary?owner=...` require `followUp.view`; `/assignees` lists active eligible staff. Follow-up writes
require `followUp.manage`.

Open a reviewed WhatsApp message from a pending follow-up (requires an international client number; the admin
sends it manually)

## Quotations and validity

Create professional travel quotations

Generate branded quotation PDFs

Quotation PDFs keep international guest names and tour text (Latin extended, Cyrillic, Greek, Sinhala and
Tamil), wrap long inclusions, exclusions and guest-facing notes across pages, and include the saved quotation
number and validity date. The displayed advance and remaining amounts are targets from the quoted price, not
proof of a payment received. Unsupported glyphs show a visible placeholder.

Set an optional **Valid until** date on quotations. It appears on the client PDF, in quotation history, and in
CSV exports. In **Quotation History → Offer validity**, find sent offers past their validity date, ending
within seven Sri Lanka calendar days, or missing a date. An expired date is flagged for a rate review but does
not silently change the quotation's status or prevent a client from accepting it. Edit or clear the date when
revising an offer. Saved quotation PDF downloads use the saved number, creation date and prices, and warn when
the offer is a draft, rejected, expired or past its validity date. Unsaved previews are marked **DRAFT - NOT SAVED**
and have no official number. Save any changes before downloading a client-ready PDF.

**Quotation reminder coverage:** in Quotation History, choose **No pending reminder** to find Sent,
unconverted offers without a pending CRM follow-up, oldest first. Create a follow-up from the existing bell
action, or update the offer status after the guest replies. A completed or cancelled reminder no longer covers
the offer; this view does not prove whether anyone contacted the guest outside the CRM. It combines with
search, currency and validity filters, and the CSV export follows the selected view. The filter requires
`quotation.view` and `followUp.view`, uses an indexed pending-reminder lookup and disables response caching.
`GET /api/quotations?followUp=missing` rejects other status filters and never exposes follow-up notes.

## Revisions and booking conversion

From **Quotation History**, use **Create revised draft** to copy an unconverted offer into a separate draft
with a new quotation number. Prices, itinerary details, inclusions, exclusions, and internal notes are copied;
the client and inquiry link are retained. The booking link and validity date are cleared, and the original
offer's status and prices stay as saved. The new record shows its source quotation number even if the source
is later deleted. Edit the new draft, check current rates, set a fresh validity date, then send its PDF.
Requires `quotation.view` and `quotation.create`; converted quotations must be amended through their booking
instead. `POST /api/quotations/:id/revisions` creates the new draft and ignores client-supplied fields.

For a revised quotation, choose **Compare with previous quotation** in Quotation History to see the source and
revised offer side by side. Changed dates, terms, transport and prices are highlighted; **Only changes** hides
identical fields. The comparison reads both saved quotations when opened, so it reflects later edits to either
record. It displays different currencies as recorded without converting them. If the source was deleted, its
saved number remains visible, but comparison is unavailable.

From **Quotation History**, use the calendar-check **Convert to booking** button on the accepted quotation.
Review the saved guest details, travel dates, currency, total and requested advance first. Confirm the
conversion; if the linked inquiry has no email or WhatsApp number, the CRM asks for them. The button needs
`quotation.convert` and is disabled after conversion. The quotation becomes Accepted and links to the new
Confirmed booking; its linked inquiry becomes Converted.

The requested advance on a quotation is a payment term, not money received. The booking therefore starts
with **Paid 0** and **Payment Pending** even when the quotation requests a deposit. In **Bookings →
Payments**, record each real receipt with its actual date, method, currency and reference after checking the
bank or PayHere transaction. Recheck the booking balance and generate its invoice/receipt from saved payment
records. Additional Notes stay on the quotation; add genuine guest requests separately in the booking's
Special Requests field. Add hotel stays, transport, itinerary and private supplier costs in the booking as
needed; these operational records are not created from quotation text.
