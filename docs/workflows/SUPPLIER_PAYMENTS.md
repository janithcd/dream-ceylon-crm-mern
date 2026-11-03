# Supplier costs and payments

[Project overview](../../README.md) · [Feature index](../../PROJECT_FEATURES.md) · [API reference](../../API_DOCUMENTATION.md)

Track supplier costs separately from guest selling prices, record payments and prepare remittance advice. Access requires the relevant cost permissions.

## Contents

- [Costs and profitability](#costs-and-profitability)
- [Recording supplier payments](#recording-supplier-payments)
- [Payment schedule and alerts](#payment-schedule-and-alerts)
- [Payment register and bank matching](#payment-register-and-bank-matching)
- [Payment vouchers and remittance emails](#payment-vouchers-and-remittance-emails)
- [Bank receipts and supplier acknowledgement](#bank-receipts-and-supplier-acknowledgement)

## Costs and profitability

The **Cost & Profit** page is available to Super Admin and Finance accounts. Open a quotation to enter
*estimated* supplier costs, or a booking to enter *actual* supplier costs. Cost entries are stored separately
from client quotations and invoices, and require `cost.view` to read or `cost.manage` to change. A Super Admin
can grant these permissions to another admin. Costs never appear in customer PDFs.

Enter each supplier amount in its own currency. If it differs from the quotation or booking currency, enter
the rate as **one supplier currency unit in the selling currency**. For example, if the client price is in USD
and one LKR is worth 0.0033 USD, enter `0.0033` for an LKR cost. This rate is saved on the entry; the CRM does
not fetch live exchange rates. Changing a sale currency flags old costs for review and hides profit until they
are revalued. The summary uses `profit = client selling price − recorded costs` and `margin = profit / client
selling price`. No profit is shown before any costs are entered. Booking profit uses the full booked selling
price, while actual cash received and refunds remain in Payment Reports.

Record private supplier costs and compare estimated quotation profit with booked profit

## Recording supplier payments

For **actual booking costs**, enter an optional supplier payment due date, then use **Payments** on a saved
cost to record each deposit with its Sri Lanka payment date, method, optional reference and note. The history
records the staff member and time; previous paid totals remain as unitemized opening balances. Use **Correct
paid total** only for adjustments, which are also recorded in history. Staff with `cost.view` can read the
history; `cost.manage` is required to record a payment at `POST /api/finance/costs/:id/payments`. Payments
cannot exceed the remaining amount, be dated in the future, or be recorded on quotation estimates. A cost with
recorded payments cannot be deleted or changed to another currency; reconcile the history with bank records.
Cost and payment actions appear in booking activity without exposing private supplier amounts there.

## Payment schedule and alerts

The cost table shows what remains in each supplier's currency; it never adds different currencies together.
The booking tab has a paged **Supplier payment schedule** with filters for overdue, due soon (overdue plus
today through the next six Sri Lanka calendar days), later, no due date, and all unpaid costs. It shows the
filtered remaining total separately by currency, 25 costs per page, and links to the booking. Costs without
dates do not appear in the header alert; set a date so Finance can plan payment. `GET
/api/finance/costs/schedule` requires `cost.view` and accepts `filter`, `page`, and `limit` (up to 50). The
header's **Supplier dues** alert remains limited to overdue and due soon, up to 50 earliest entries, and
refreshes after cost and payment edits, when the CRM regains focus, every five minutes, or manually. Fully
paid costs leave the schedule. Bookings with supplier payments or correction history cannot be deleted; cancel
the booking to preserve its payment record.

## Payment register and bank matching

The booking tab also has a **Supplier payment register** for matching recorded deposits to bank records.
Filter by inclusive payment dates (Sri Lanka calendar, up to 366 days) and a case-insensitive payment
reference, then open the linked booking or export all matching payments as CSV. The default view is the
current Sri Lanka month, with 25 payments per page and separate totals for each supplier currency. Unitemized
opening balances and manual paid total corrections are excluded because they are not individual cash payments.
`GET /api/finance/costs/payment-register` requires `cost.view`; `/payment-register/export` additionally
requires `report.export` and allows up to 10,000 matching rows per download. Narrow the filter for larger
exports.

Finance staff can filter the register to **To match** or **Matched**, enter a bank statement or cashbook
reference to reconcile each payment, and reopen a mistaken match with a required reason. These actions require
`cost.view` and `cost.manage` at `PATCH /api/finance/costs/:id/payments/:paymentId/reconciliation` (`{
reconciled: true, statementReference }` or `{ reconciled: false, reason }`). The payment amount and paid total
do not change. The register, booking payment history, and CSV show current status; reconciliation events
retain the staff member, time, previous reference, and reopening reason. Older payments start unmatched until
reviewed. CSV exports respect the selected status filter.

## Payment vouchers and remittance emails

Open **Cost & Profit → Booking actual costs → select a booking → a cost's Payments → Payment voucher / email**
on an individual recorded payment. You can also use **Supplier payment register → Payment voucher / email**
for a recent payment; change the register's date range to find older payments. The action does not appear for
quotation estimates, opening balances or paid-total corrections. Enter the supplier name, invoice/pro forma reference, optional supplier email and guest/stay
reference, and the actual amount, currency and transaction reference from the payment confirmation. Check the
details before saving. The payment date and method come from the selected recorded payment. Each voucher
covers that payment only; opening balances and paid-total corrections cannot produce vouchers.

A payment recorded against a USD cost can have an LKR transfer amount. Enter the actual agreed amount sent,
excluding bank charges; the CRM does not infer an exchange rate or change the cost ledger. If the transfer and
cost use the same currency, the amounts must match. Bank transfers and card payments require a transaction
reference. The voucher does not claim full invoice settlement or replace the bank confirmation or the hotel's
receipt.

Download the branded **Supplier Payment Voucher / Remittance Advice** PDF, then review and copy the email into
Zoho Mail or open the configured email app. Attach the bank confirmation and downloaded voucher yourself and
ask the hotel to acknowledge allocation and send its receipt. Email drafts contain the reviewed
supplier/invoice/payment references, without cost descriptions, private payment notes, margins, correction
reasons or staff names. No email is sent automatically, files are attached to the email manually, and preparing a draft
does not mark it sent. Guest hotel vouchers remain separate reservation documents.

Corrections require a reason and append a numbered revision with staff and time; previous details remain in
the private revision history. Saving uses the cost document version to reject stale updates. PDF downloads
require the revision currently displayed. Reload after a conflict. `GET` and `PUT
/api/finance/costs/:id/payments/:paymentId/remittance` require `cost.view`; saving also requires `cost.manage`
and `{ expectedVersion, confirmed: true, ...details }`. `POST` to the same path plus `/pdf` requires
`cost.view`, `pdf.generate` and `{ revision }`. Advice responses use `Cache-Control: no-store`. General
booking activity records saves/downloads without private supplier details.

## Bank receipts and supplier acknowledgement

Open **Cost & Profit → Booking → Payments → Receipts / acknowledgement**, or use the same button in the
supplier payment register. This belongs to one recorded supplier payment, not the whole invoice or booking.

1. Upload the bank transfer proof after payment. PDF, PNG and JPEG files are supported, up to 5 MB each and
   five active files per payment. Choose **Supplier receipt** when saving the hotel's receipt later.
2. Download the bank proof and the payment voucher, then attach both to your reviewed business email to the
   hotel. Uploading a file does not send an email or mark payment as acknowledged.
3. When the hotel confirms receipt/allocation, record its contact name, confirmation date and channel
   (Email, WhatsApp, Phone or Other). Add its receipt/reference and an internal note if useful. Check the
   confirmation box only after receiving an actual acknowledgement.
4. Filter the register by **Awaiting acknowledgement** to follow up on payments. The status and date also
   appear in the CSV export. This filter combines with the selected payment dates and bank matching status.

Withdraw an incorrect attachment with a reason; its metadata and original bytes remain stored for audit,
but it is no longer offered for download. Reopen a mistaken acknowledgement with a reason, then record the
correct confirmation. Previous details, staff names and timestamps remain in the private history. Stale
acknowledgement edits are rejected; reload and review the current record before trying again. These actions
do not change the payment amount, paid balance, bank matching or voucher revisions.

Files require authenticated `cost.view` access to list/download, and `cost.view` plus `cost.manage` to
upload/withdraw or change acknowledgement. Files are stored privately in MongoDB, outside public uploads;
include the database in backups and allow for receipt storage growth. Downloads use attachment disposition
and `Cache-Control: no-store`. File size, signatures and extensions are checked; this is not virus scanning.
General booking activity omits filenames and private confirmation details.

All endpoints start with `/api/finance/costs/:id/payments/:paymentId`:

| Method and path | Purpose |
| --- | --- |
| `GET /attachments?historyPage=1` | Active files and paged withdrawal history (10 per page). |
| `POST /attachments?kind=bank-proof` | Raw PDF/image bytes; set its MIME `Content-Type` and URL-encoded filename in `X-File-Name`. Kind can also be `supplier-receipt`. |
| `GET /attachments/:attachmentId` | Download an active file belonging to this payment. |
| `PATCH /attachments/:attachmentId/withdraw` | Withdraw with `{ reason }`. |
| `GET /acknowledgement` | Current confirmation, history and cost document version. |
| `PATCH /acknowledgement` | Save `{ action: "acknowledge", expectedVersion, acknowledgedDate, channel, contactName, reference, note, confirmed: true }` or reopen with `{ action: "reopen", expectedVersion, reason }`. |

The register and CSV endpoints accept `acknowledgement=all|awaiting|acknowledged`. Older individual payments
start as awaiting acknowledgement. Opening balances and paid-total corrections remain excluded.
