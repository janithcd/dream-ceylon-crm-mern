# Guest payments and documents

[Project overview](../../README.md) · [Feature index](../../PROJECT_FEATURES.md) · [API reference](../../API_DOCUMENTATION.md)

Record guest receipts and refunds, review outstanding balances, and issue payment documents. For private supplier costs and remittance advice, see [Supplier payments](SUPPLIER_PAYMENTS.md).

## Contents

- [Payment overview](#payment-overview)
- [Outstanding balances and collection targets](#outstanding-balances-and-collection-targets)
- [Contact records and reminders](#contact-records-and-reminders)
- [Currencies and payment corrections](#currencies-and-payment-corrections)
- [Bank matching and PayHere references](#bank-matching-and-payhere-references)
- [Refund controls](#refund-controls)
- [Booking invoices](#booking-invoices)
- [Receipts and refund confirmations](#receipts-and-refund-confirmations)
- [Guest statements and ledger review](#guest-statements-and-ledger-review)
- [Payment reports](#payment-reports)

## Payment overview

- Record booking payments
- View payment history
- Handle refunds
- Match recorded guest receipts and refunds against bank or cashbook entries
- Calculate paid, pending, and outstanding amounts
- Generate individual payment receipts
- View financial reports
- Keep cost entries visible only to admins with cost permissions
- Export report data

Generate booking invoices, individual payment receipts, refund confirmations and guest payment statements

Track outstanding balances

Set an optional payment due date when creating or editing a booking; Finance can update it from Outstanding
Balances

Log actual payment contact and schedule the next follow-up from Outstanding Balances

## Outstanding balances and collection targets

The **Outstanding Balances** page lists open balances by agreed payment due date, with filters for overdue
dates, the next seven days, later dates, and bookings without a due date. Departure filters can be combined
with payment timing. Existing bookings have no due date until staff records one; a departure date alone is not
treated as a payment deadline. Payment dates use Sri Lanka calendar days, and recording a payment removes a
fully paid booking from this queue.

For packages requiring a hotel deposit, set a **hotel advance to collect** in the booking currency and its due
date (for example, the agreed 50% of hotel charges), followed by the existing final balance due date. The CRM
does not infer this amount from supplier costs, which may use different currencies. The hotel advance is a
collection target, not money received; only payment records change the paid total. The payment modal shows
both milestone targets and outstanding amounts. Net payments cover the hotel advance first, and a refund can
reopen it. Outstanding Balances, due filters, header alerts, and reviewed WhatsApp reminders use the next
unpaid milestone; older bookings without an advance continue to use their existing balance due date. Staff
with `payment.update` can change the advance at `PATCH /api/bookings/:id/hotel-advance` with `{
"hotelAdvanceAmount": 300, "hotelAdvanceDueDate": "YYYY-MM-DD" }` (send `0` and `null` to clear). The advance
cannot exceed the booking price, and its date cannot fall after the final due date.

## Contact records and reminders

Admins who can record payments can prepare a WhatsApp reminder from an open balance. The CRM reloads the
booking before drafting, calculates the remaining amount, and shows the recipient and message for review.
Opening WhatsApp does not send the message or mark the booking as contacted.

After reaching the guest by WhatsApp, phone, email, or another channel, staff with `payment.update` can use
**Log contact** to record the time and an optional next follow-up date. **Follow-ups due** shows open balances
with a follow-up scheduled for today or earlier in Sri Lanka; it combines with the payment and departure
filters. Logging a new contact replaces the current follow-up date, while booking history retains previous
contact entries for staff with `payment.view`. A fully paid or cancelled booking cannot be logged from the
balance queue.

Admins with booking and payment view access see a **Payments** alert in the header for open balances whose
payment date is overdue or whose scheduled contact follow-up is due. A booking with both conditions counts
once in the badge. The panel shows five bookings and links to the relevant filtered queue. It refreshes after
payment changes, when the CRM regains focus, and every five minutes; it does not send messages or emails.

## Currencies and payment corrections

Record guest payments and refunds in the **booking currency**. If a bank transfer arrives in another currency,
calculate the agreed booking-currency amount first and note the original amount and rate; the CRM does not
fetch or apply exchange rates. The API rejects a different payment currency on create or edit. Once a booking
has a paid amount or any payment record, its currency is locked. After payment records exist, booking edits
cannot overwrite the paid amount or payment status from a stale form. Older payments whose currency differs
from their booking are highlighted in Payment Reports, the matching register, and booking payment history.
They cannot be newly matched to a bank entry, and recalculating a booking balance excludes their
different-currency amounts. Finance can use **Correct payment** in the matching register to enter the verified
booking-currency amount and an audit reason; a previously matched payment must be reopened first. The
correction updates the guest balance, and the activity log retains the old amount and currency. Editing a
refund also requires `payment.refund`, even when changing only its amount. Review the bank entry and agreed
conversion before correcting; no automatic conversion is performed.

Use **Correct payment** in the matching register for an unmatched record after checking its bank entry or
cashbook entry. Finance can correct the booking-currency amount, Sri Lanka payment date, receipt/refund
direction and type, method and reference. Older refund type/status mismatches and currency mismatches are
highlighted. A currency correction needs a verified converted amount; the CRM does not calculate exchange
rates. A matched payment must first be reopened with a reason. Every `PUT /api/booking-payments/:id` edit now
needs `correctionReason` (3–300 characters) and an actual detail change; the activity log stores the old and
new payment details, changed fields and reason without including private payment notes. Changing or editing a
refund needs both `payment.update` and `payment.refund`. Payment dates cannot be corrected into the future.
The balance is recalculated after a correction, and a guest statement can be issued once all booking ledger
inconsistencies are resolved. Cancelled entries remain outside the matching register.

## Bank matching and PayHere references

In **Payment Reports → Guest payment matching**, Finance can review recorded receipts and refunds for a Sri
Lanka date range (up to 366 days), search payment or statement references, and filter **To match** or
**Matched**. Enter the bank statement or cashbook reference to match a payment; reopen an incorrect match with
a reason. Each change records the staff member, time, reference and a snapshot of the amount, currency and
status. Matched payments must be reopened before editing or deleting them. Matching never changes the paid
balance, and cancelled payments do not appear in this register. Existing payments start as unmatched. The
register totals received, refunded and net separately by currency, pages 25 records at a time, and exports up
to 10,000 matching records to CSV. `GET /api/booking-payments/register` requires `payment.view` and
`report.view`; `/register/export` also requires `report.export`. `PATCH
/api/booking-payments/:id/reconciliation` requires `payment.view` and `payment.reconcile` with `{
"reconciled": true, "statementReference": "..." }` or `{ "reconciled": false, "reason": "..." }`. Finance and
Super Admin have the new reconcile permission by default; a Super Admin can grant it to others.

**PayHere tracking:** select PayHere as the method for a confirmed guest payment or refund, and enter its
payment or refund reference (required, 1–100 characters). Payment Reports and Guest payment matching can
filter by PayHere or any other saved method; register totals and CSV follow the same filter. After verifying
the PayHere transaction and settlement report, match it to a bank statement or cashbook reference. A bank
payout may combine payments and deduct fees, so retain the confirmed guest payment amount and its original
payment date; matching does not adjust the guest balance or calculate provider fees. Older records marked Card
or Online Payment can be corrected to PayHere with an audit reason and a reference; matched records must first
be reopened.

Received PayHere payments now claim one reference across all bookings (ignoring surrounding spaces and letter
case), so a second entry or correction with the same reference returns a conflict before changing the guest
balance. The database index also resolves simultaneous writes from different bookings; historical PayHere
receipts without an indexed key are checked when saving. Cancelled entries do not claim a reference, and
refunds may use their own refund ID or the original payment reference. Check the guest payment register if a
conflict appears; this guard cannot verify whether a provider transaction actually settled.

## Refund controls

Refunds are separate records with type **Refund** and status **Refunded**; a cancelled refund does not change
the guest balance. The payment form shows the net amount of recorded receipts still available to refund. The
API rejects refunds above that amount, mismatched refund type/status, and edits or deletions of receipts that
would leave refunds greater than receipts. Each amount uses at most two decimals. Existing negative balances
from older data may be reduced, but changes cannot deepen the deficit. Only records in the booking currency
count toward the refundable amount; bank-matched records still require reopening before editing or deletion.

Payment creates, edits, and deletions are serialized per booking across API processes while refund
availability and the booking balance are checked. Simultaneous refunds cannot both consume the same available
amount. A booking write lease expires after a failed process; a request waiting more than five seconds returns
a conflict and can be retried.

## Booking invoices

The booking invoice uses the current booking price, optional hotel advance target and saved due dates. It
displays the company's configured payment instructions, never private admin notes or special requests, and
does not claim a paid amount from the booking summary. A cancelled or unpriced booking cannot produce one. For
proof of a payment, open **Bookings → Payments** and download the receipt on the specific recorded payment;
use the guest statement for the verified full balance. The older booking-level receipt action was removed
because it presented a cumulative balance as one receipt; direct API calls return HTTP 410 with guidance.
Guest invoices are current snapshots, not immutable historical invoice revisions.

Booking invoices support Latin extended, Cyrillic, Greek, Sinhala and Tamil guest names and package text using
the same embedded font coverage as the other operational PDFs. Unknown glyphs show a visible placeholder; long
payment instructions continue on another page. The invoice footer includes the configured business contact
details.

## Receipts and refund confirmations

The payment history downloads a payment receipt for recorded receipts and a **refund confirmation** for
refunds. Each PDF shows only that transaction's amount, date, method and reference, plus the guest and booking
identifiers. Private payment notes and the unchecked booking paid/balance summary stay off guest documents;
use the validated guest payment statement for the full balance. The PDFs support Latin extended, Cyrillic,
Greek, Sinhala and Tamil guest names, and long references continue onto another page. Cancelled entries and
older records with an invalid amount, future date, different currency, or conflicting payment type/status need
correction before a document can be generated. Refund confirmations have their own filename and audit label.
PDFs are returned with `Cache-Control: no-store`.

## Guest statements and ledger review

In **Bookings → Payments**, staff with booking view, payment view and PDF permission can download a **guest
payment statement**. It shows the booking price, received payments, refunds, net paid, any guest credit,
remaining balance and the hotel advance target with due dates. Its dated history includes payment numbers,
methods and references, but excludes cancelled entries, supplier costs and internal notes. All amounts use the
booking currency. The PDF stops with a review message if older foreign-currency, mismatched refund, negative
balance, future-dated or unitemized paid amounts would make the statement inaccurate. `POST
/api/booking-pdf/payment-statement/:id` requires `booking.view`, `payment.view` and `pdf.generate`; downloads
are logged and not cached.

The payment modal checks **statement readiness** when it opens or refreshes. It lists each affected payment
number and a short next step for mismatched receipt/refund directions, different currencies, invalid amounts
or dates, and future-dated records. Booking-level issues cover a cancelled booking, invalid price or hotel
advance, refunds above receipts, and a paid total that does not match the ledger. Dated payment issues link to
the matching register with that date and payment number selected for Finance. The download button remains
unavailable while a review is required or the check cannot be completed. `GET
/api/booking-pdf/payment-statement/:id/readiness` requires `booking.view` and `payment.view`, returns `{
ready, issues, checkedAt }`, and is not cached. The PDF repeats the same validation under a booking payment
lock when it is generated, so a later change cannot rely on an earlier readiness result.

For an older booking whose **paid amount differs from its payment history**, the payment modal shows both
totals. Verify every historical receipt and refund against the bank or cashbook before issuing a statement.
Adding a payment recalculates the booking paid amount from the full recorded history, so enter all verified
missing entries with their actual dates and references. If the payment history is complete and the booking
summary is stale, Finance can select **Reconcile from complete ledger**, enter an audit reason and confirm
that all entries were checked. This changes the booking paid total and status to the validated ledger result
without creating a payment; it can reduce an unitemized opening amount to zero. `POST
/api/booking-payments/booking/:bookingId/reconcile-summary` requires `booking.view`, `payment.view`,
`payment.update` and `payment.reconcile`, plus the reviewed booked/ledger/target amounts,
`confirmLedgerComplete: true`, and a 10–300 character reason. It rejects other statement issues, stale totals,
and concurrent changes. The correction and reason are recorded in the activity log.

## Payment reports

Payment Reports keeps received, refunded, net, and cancelled amounts separate by currency when viewing all
payments. Select one currency to see its summary cards and monetary charts; the status chart still counts
records across the current filters. Payment date filters and month groupings use Sri Lanka calendar days. The
API returns `summaryByCurrency` for all views, and returns a single `summary` plus amount charts only when
`currency` is selected. Invalid dates or page sizes return 400.
