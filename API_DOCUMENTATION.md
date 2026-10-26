# API Documentation

Development base URL:

```text
http://localhost:5000/api
```

Private endpoints require:

```http
Authorization: Bearer <JWT_TOKEN>
```

## Health

```http
GET /health
```

## Authentication

```http
POST /auth/login
GET  /auth/profile
```

## Admin Management

```http
GET    /admins
POST   /admins
GET    /admins/:id
PUT    /admins/:id
PATCH  /admins/:id/status
PATCH  /admins/:id/password
DELETE /admins/:id
```

## Destinations

```http
GET    /destinations
POST   /destinations
GET    /destinations/:id
PUT    /destinations/:id
DELETE /destinations/:id
```

## Packages

```http
GET    /packages
POST   /packages
GET    /packages/:id
PUT    /packages/:id
DELETE /packages/:id
```

## Inquiries

```http
GET    /inquiries
POST   /inquiries
GET    /inquiries/:id
PUT    /inquiries/:id
DELETE /inquiries/:id
```

## Quotations

```http
GET    /quotations
POST   /quotations
GET    /quotations/:id
PUT    /quotations/:id
DELETE /quotations/:id
POST   /quotations/:id/convert-to-booking
POST   /quotations/pdf
```

## Bookings

```http
GET    /bookings
POST   /bookings
GET    /bookings/:id
PUT    /bookings/:id
DELETE /bookings/:id
POST   /booking-pdf/invoice/:id
POST   /booking-pdf/receipt/:id
```

## Payments

```http
GET    /booking-payments
POST   /booking-payments
GET    /booking-payments/booking/:bookingId
GET    /booking-payments/:id
PUT    /booking-payments/:id
DELETE /booking-payments/:id
POST   /payment-receipts/:id
GET    /booking-pdf/payment-statement/:id/readiness
POST   /booking-payments/booking/:bookingId/reconcile-summary
```

Statement readiness returns `{ "ready": true, "issues": [], "checkedAt": "..." }` or actionable issues with a `code`, `message`, optional `paymentNo` and `paymentDate`. It requires `booking.view` and `payment.view` and does not cache results. A blocked statement still returns HTTP 200 for the readiness check; downloading the PDF rechecks the ledger and returns a conflict until the data is corrected.

A `paid_mismatch` issue also includes `bookedPaidCents`, `ledgerNetCents`, `targetPaidCents`, `receivedCents`, and `refundedCents`. After reviewing all historical entries, Finance may post `{ "confirmLedgerComplete": true, "reason": "Checked bank entries", "expectedBookedPaidCents": 90000, "expectedLedgerNetCents": 40000, "expectedTargetPaidCents": 40000 }` to `reconcile-summary`. The route requires `booking.view`, `payment.view`, `payment.update`, and `payment.reconcile`. It recalculates the booking summary only when the ledger is otherwise valid and still matches those reviewed totals. Missing actual receipts should be recorded as payment entries with their real dates and references first.

`PUT /booking-payments/:id` corrects an unmatched payment. Include the fields being corrected and a `correctionReason` of 3–300 characters. Send `expectedVersion` from the register row to reject stale edits. A currency correction must include the verified booking-currency `amount`, even if its numeric value is unchanged. Refund edits need both `payment.update` and `payment.refund`; a matched payment must first be reopened through `PATCH /booking-payments/:id/reconciliation`.

## Supplier Costs and Profit

Requires `cost.view` for read and both `cost.view` and `cost.manage` for writes. `:type` is `quotation` or `booking`.

```http
GET    /finance/costs/:type/:id
POST   /finance/costs/:type/:id
PUT    /finance/costs/:id
DELETE /finance/costs/:id
```

POST and PUT take `{ "category": "Hotel", "description": "Two nights", "amount": 30000, "currency": "LKR", "conversionRate": 0.003333 }`. The conversion rate is **one unit of the supplier currency in the quotation or booking currency**; it is set to 1 when currencies match. Each item stores its target currency so that changes to the parent sale currency require a manual revaluation. GET returns cost items and a profit summary, plus the linked quotation's estimated cost when viewing a converted booking. These endpoints are private and separate from public and client document APIs.

## Follow-Ups

```http
GET    /follow-ups
POST   /follow-ups
GET    /follow-ups/summary
GET    /follow-ups/:id
PUT    /follow-ups/:id
PATCH  /follow-ups/:id/complete
DELETE /follow-ups/:id
```

## Customers

```http
GET /customers/search
GET /customers/profile
```

## Vehicles

```http
GET    /vehicles
POST   /vehicles
GET    /vehicles/:id
PUT    /vehicles/:id
DELETE /vehicles/:id
```

## Dashboard, Finance, Settings and Logs

```http
GET  /dashboard/stats
GET  /finance/reports/payments
GET  /settings/company
PUT  /settings/company
POST /settings/company/reset
GET  /activity-logs
GET  /activity-logs/summary
GET  /activity-logs/:id
```

## AI and PDF

```http
POST /ai/client-reply
POST /ai/itinerary
POST /pdf/itinerary
```

## Public Website API

```http
GET  /public/home
GET  /public/destinations
GET  /public/destinations/:id
GET  /public/packages
GET  /public/packages/:id
GET  /public/vehicles
POST /public/inquiries
```

## Common Responses

```text
200 Successful
201 Created
400 Invalid request
401 Unauthenticated
403 Insufficient permission
404 Not found
409 Duplicate resource
429 Rate limit exceeded
500 Server error
```
