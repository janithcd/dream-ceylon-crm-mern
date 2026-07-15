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
```

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
