# Feature guide

[Project overview](README.md) · [API reference](API_DOCUMENTATION.md) · [Development and deployment](docs/DEVOPS.md)

Use this page to find a module and its operating instructions. The detailed guides describe permissions, validation, reminders and document behavior.

## Sales and quotations

- Website and manual inquiries with source, priority, ownership and loss reasons.
- New Lead Queue, first-contact records, reviewed response drafts and same-email history cues.
- Customer history, assigned follow-ups, due-work queues and lead conversion insights.
- Quotations with validity dates, reminder coverage, revisions, comparison and booking conversion.

[Sales and quotation workflow](docs/workflows/SALES.md)

## Bookings and operations

- Booking details, calendar, named traveler rosters and daily itineraries.
- Hotel stays, cancellation deadlines, supplier contact history and confirmation drafts.
- Saved rooming plans, hotel vouchers and reviewed rooming emails.
- Transport assignments, airport transfer schedules, flight details and guest pickup drafts.
- Preparation tasks, My Tasks, Team Tasks, departure readiness and pre-arrival contact tracking.
- Private handover journals, unread team worklists, operations PDFs and cancellation review.

[Booking and operations workflow](docs/workflows/BOOKINGS.md)

## Trip support and guest care

- Guest issues with ownership, priorities, follow-up dates, updates and resolution history.
- Worklists and alerts for urgent, overdue and unassigned issues.
- Post-trip contact records, feedback, follow-up reminders and care ownership.
- Service recovery for low ratings, with separate resolution history.

[Trip support and guest care workflow](docs/workflows/GUEST_CARE.md)

## Guest payments

- Individual receipts and refunds in the booking currency, with correction history.
- Payment due dates, hotel advance collection targets and outstanding balance reminders.
- Bank matching, PayHere reference tracking and duplicate receipt protection.
- Currency-separated reports and CSV exports.
- Guest invoices, payment receipts, refund confirmations and validated payment statements.

[Guest payment workflow](docs/workflows/GUEST_PAYMENTS.md)

## Supplier costs and payments

- Searchable supplier directory for hotels, guides, safari jeep providers and other partners, with private contacts, terms and active status.
- Dated supplier rate cards with meal plans, occupancy, source references, deactivation and prior revisions; rates never change saved quote or booking prices automatically.
- Hotel stay form copies current directory details while keeping the booking's saved contact snapshot.
- Estimated quotation costs and actual booking costs with entered conversion rates.
- Private profit and margin summaries.
- Individual supplier payments, due schedules, bank matching and payment register exports.
- Payment vouchers/remittance advice with actual transfer currency, revision history and reviewed email drafts.
- Private bank proofs and supplier receipts, acknowledgement history and filters for supplier follow-up.

[Supplier payment workflow](docs/workflows/SUPPLIER_PAYMENTS.md)

[Supplier directory workflow](docs/workflows/SUPPLIER_DIRECTORY.md)

## Documents and AI

| Document or tool | Purpose |
| --- | --- |
| Quotation PDF | Share an offer, validity date and collection targets. |
| Booking invoice | Show the booked price and saved payment instructions. |
| Payment receipt / refund confirmation | Document one recorded guest transaction. |
| Guest payment statement | Show the validated booking ledger and balance. |
| Guest itinerary / hotel voucher | Share saved travel or confirmed reservation details. |
| Operations / departure handover PDF | Support authorized staff and supplier handoffs. |
| Supplier payment voucher | Identify a payment and its invoice reference for the supplier. |
| AI tools | Prepare client replies and itinerary content for review. |

Company settings control business identity and document branding. Several operational and financial PDFs embed fonts for Latin extended, Cyrillic, Greek, Sinhala and Tamil text; individual document behavior is described in the workflow guides.

## Catalog, administration and reporting

- Destination, package and vehicle management, plus public website APIs and inquiry submission.
- Company information, PDF branding, watermark, terms and payment instructions.
- Five administrator roles, additional permissions and active/inactive accounts.
- Account protection, password resets, authenticated routes and backend authorization.
- Dashboards, upcoming departures, task alerts, financial reports and searchable activity history.

See [API reference](API_DOCUMENTATION.md), [account recovery](docs/ACCOUNT_RECOVERY.md) and [security policy](SECURITY.md).

## Operating conventions

- Calendar dates, due-work queues and reminders use **Asia/Colombo**.
- Supplier costs and margins require cost permissions and stay out of customer documents.
- Email and WhatsApp drafts are reviewed and sent by staff; preparing a draft does not record actual contact. Password recovery uses the configured transactional email provider.
- Payment records and bank matching are internal records. Provider settlement and hotel acknowledgement still need to be checked against the relevant external records.

For planned infrastructure work, see the [roadmap](README.md#roadmap).
