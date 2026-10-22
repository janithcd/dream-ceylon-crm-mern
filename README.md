<div align="center">

# 🌴 Dream Ceylon CRM

### A modern MERN-stack CRM for Sri Lankan Destination Management Companies

<p>
  Manage inquiries, customers, quotations, bookings, payments, follow-ups, vehicles, PDFs, AI tools, analytics, and administrator permissions from one platform.
</p>

<p>
  <img src="https://img.shields.io/badge/Status-DevOps%20Upgrade-blue?style=for-the-badge" alt="Status" />
  <img src="https://img.shields.io/badge/Version-1.0.0-blue?style=for-the-badge" alt="Version" />
  <a href="https://github.com/janithcd/dream-ceylon-crm-mern/actions/workflows/ci.yml"><img src="https://github.com/janithcd/dream-ceylon-crm-mern/actions/workflows/ci.yml/badge.svg" alt="CRM CI" /></a>
  <img src="https://img.shields.io/badge/License-Private-lightgrey?style=for-the-badge" alt="License" />
</p>

<p>
  <img src="https://img.shields.io/badge/Node.js-22.x-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Express.js-Backend-000000?style=flat-square&logo=express&logoColor=white" alt="Express.js" />
  <img src="https://img.shields.io/badge/React-Frontend-61DAFB?style=flat-square&logo=react&logoColor=000000" alt="React" />
  <img src="https://img.shields.io/badge/Vite-Build-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/MongoDB-Atlas-47A248?style=flat-square&logo=mongodb&logoColor=white" alt="MongoDB" />
  <img src="https://img.shields.io/badge/OpenAI-AI%20Tools-412991?style=flat-square&logo=openai&logoColor=white" alt="OpenAI" />
</p>

</div>

---

## ✨ Overview

**Dream Ceylon CRM** is a full-stack travel operations and customer relationship management platform developed for **Dream Ceylon Journeys**, a Sri Lankan Destination Management Company.

It supports the complete customer journey:

```text
Inquiry → Follow-Up → Quotation → Booking → Payment → Reports
```

The system combines operational management, AI-powered productivity tools, branded PDF generation, analytics, role-based access control, and public APIs for a future Next.js tourism website.

---

## 🚀 Key Features

### 👥 Customer and Sales Management

- Capture and manage customer inquiries
- Search, filter, update, and delete inquiries
- Build complete customer profiles
- View inquiry, quotation, booking, and payment history
- Schedule and complete customer follow-ups
- Identify overdue and upcoming follow-ups
- Open a reviewed WhatsApp message from a pending follow-up (requires an international client number; the admin sends it manually)
- Export business data to CSV

### 🧾 Quotations and Bookings

- Create professional travel quotations
- Generate branded quotation PDFs
- Set an optional **Valid until** date on quotations. It appears on the client PDF, in quotation history, and in CSV exports. In **Quotation History → Offer validity**, find sent offers past their validity date, ending within seven Sri Lanka calendar days, or missing a date. An expired date is flagged for a rate review but does not silently change the quotation's status or prevent a client from accepting it. Edit or clear the date when revising an offer. Saved quotation PDF downloads retain the saved quotation number and creation date; unsaved previews use a temporary number and current date.
- From **Quotation History**, use **Create revised draft** to copy an unconverted offer into a separate draft with a new quotation number. Prices, itinerary details, inclusions, exclusions, and internal notes are copied; the client and inquiry link are retained. The booking link and validity date are cleared, and the original offer's status and prices stay as saved. The new record shows its source quotation number even if the source is later deleted. Edit the new draft, check current rates, set a fresh validity date, then send its PDF. Requires `quotation.view` and `quotation.create`; converted quotations must be amended through their booking instead. `POST /api/quotations/:id/revisions` creates the new draft and ignores client-supplied fields.
- For a revised quotation, choose **Compare with previous quotation** in Quotation History to see the source and revised offer side by side. Changed dates, terms, transport and prices are highlighted; **Only changes** hides identical fields. The comparison reads both saved quotations when opened, so it reflects later edits to either record. It displays different currencies as recorded without converting them. If the source was deleted, its saved number remains visible, but comparison is unavailable.
- Convert accepted quotations into bookings
- Manage booking details and status
- Open **Bookings → Readiness review** on an active booking to check the latest saved guest details, itinerary day coverage, hotel night coverage, transport confirmations and pickup details, and open/overdue/unassigned preparation tasks. Each area links to its existing editor. Empty plans show **Not assessed** rather than a pass; hotels may be guest-arranged, and overlapping stays may be intentional. Flight and pickup times remain separate. The review uses Sri Lanka calendar dates, excludes financial checks, and does not change any booking, task, or contact record. Reopen or refresh it after saving changes; completed/cancelled bookings are not assessed.
- Plan a dated, day-by-day itinerary for each booking, including activities and overnight locations; entries appear in the internal operations brief, and trip dates cannot exclude planned entries
- Preview and import the selected tour package's day plan into an empty booking itinerary, starting on a chosen trip date; personalize imported entries before sharing
- Download a branded guest itinerary PDF from the booking itinerary planner; it uses saved trip entries and company contact details, marks pending bookings as drafts, and leaves out financial and private supplier information
- Track an internal preparation checklist per booking for hotels, transport, guides, itineraries, or custom tasks; assign active staff, optional due dates, task priorities, and private handoff notes
- Record hotel stays, room and meal plans, confirmation status, and hotel references on each booking
- Save an optional supplier email on each hotel stay. For a requested stay, use **Supplier Confirmations → Prepare email** or **Bookings → Hotels → Prepare email** to review an editable confirmation request with the latest saved dates, guest name, room count, room type and meal plan. Copy the details or open your email app to send it manually. Missing supplier email or room details are highlighted; financial details, guest contact information and internal notes are excluded. Drafting does not log supplier contact or confirm the stay. Once the supplier replies, record its confirmation status and reference in Hotels. The draft requires both `booking.view` and `booking.update` and is available at `GET /api/bookings/:id/hotel-stays/:stayId/confirmation-draft` for active bookings with requested stays.
- Log a supplier email, WhatsApp message, or phone call from **Supplier Confirmations** or the booking's **Hotels** and **Transport** details. The service history records who made contact, when, the channel, a private note, and the next follow-up date. Logging updates the queue's follow-up date and shows the latest contact there; it does not send a message or confirm the supplier. Leave the next date blank to clear a reminder. Dates must be today or later and no later than check-in or the transport start (Sri Lanka time). Up to 50 recent contacts per service are kept. Staff with `booking.view` can read the history; logging needs both `booking.view` and `booking.update`, an active booking, and a requested service. Use `GET` and `POST /api/bookings/:id/supplier-contacts/:type/:itemId`, where `type` is `hotel` or `transport`. The queue and booking activity log exclude private contact notes.
- Download a branded hotel voucher from each confirmed stay in **Bookings → Hotels**. It includes the lead guest, property, check-in/out dates, nights, rooms, meal plan, hotel reference, and company contact details. Missing optional details are labelled “Not supplied”; supplier prices, payments, guest contact details, and internal notes are excluded. The voucher is not a payment receipt. Cancelled stays/bookings cannot generate vouchers, and each download is recorded in booking history.
- Review hotel night coverage in each booking to spot missing nights, reservations awaiting confirmation, overlapping stays, and stays outside the trip dates
- Plan multiple transport legs per booking with vehicle registration, chauffeur, pickup details, and status; flag possible date overlaps for the same confirmed vehicle
- Attach arrival or departure flight numbers, scheduled dates and times, airports, and terminals to transfers; keep pickup time separate and include flight details in the chauffeur operations PDF (Sri Lanka time)
- Use **Airport Transfers** to review pickups across active bookings, filter arrivals/departures or missing chauffeurs, and open transport details directly; the next seven days are shown by default, with date ranges up to 31 days. The schedule uses each transport leg’s start date as its pickup date, shows flight times separately, and includes requested/confirmed legs with saved flight details. Cancelled transfers and completed/cancelled bookings are excluded. All times are in Sri Lanka time.
- Prepare a **Guest message** from a confirmed airport transfer. The CRM reloads saved pickup, flight, chauffeur, and vehicle details into an editable WhatsApp draft, highlights missing details, and lets staff copy the text or open WhatsApp with a reviewed international recipient number. Private notes and financial information are excluded. Staff send the message themselves; drafting or opening WhatsApp does not log contact, mark a message sent, or change the booking.
- Download a private departure handover PDF with guest contact, active hotels, transport, and open tasks; prices and private notes are excluded
- Open a booking history to see dated staff actions across its details, preparation tasks, hotel stays, and PDFs; payment events require payment access and supplier cost changes require cost access
- View bookings in a calendar
- Generate booking invoices and receipts
- Track outstanding balances
- Set an optional payment due date when creating or editing a booking; Finance can update it from Outstanding Balances
- Log actual payment contact and schedule the next follow-up from Outstanding Balances
- Record private supplier costs and compare estimated quotation profit with booked profit

### 💳 Payments and Finance

- Record booking payments
- View payment history
- Handle refunds
- Calculate paid, pending, and outstanding amounts
- Generate individual payment receipts
- View financial reports
- Keep cost entries visible only to admins with cost permissions
- Export report data

The **Outstanding Balances** page lists open balances by agreed payment due date, with filters for overdue dates, the next seven days, later dates, and bookings without a due date. Departure filters can be combined with payment timing. Existing bookings have no due date until staff records one; a departure date alone is not treated as a payment deadline. Payment dates use Sri Lanka calendar days, and recording a payment removes a fully paid booking from this queue.

Admins who can record payments can prepare a WhatsApp reminder from an open balance. The CRM reloads the booking before drafting, calculates the remaining amount, and shows the recipient and message for review. Opening WhatsApp does not send the message or mark the booking as contacted.

After reaching the guest by WhatsApp, phone, email, or another channel, staff with `payment.update` can use **Log contact** to record the time and an optional next follow-up date. **Follow-ups due** shows open balances with a follow-up scheduled for today or earlier in Sri Lanka; it combines with the payment and departure filters. Logging a new contact replaces the current follow-up date, while booking history retains previous contact entries for staff with `payment.view`. A fully paid or cancelled booking cannot be logged from the balance queue.

Admins with booking and payment view access see a **Payments** alert in the header for open balances whose payment date is overdue or whose scheduled contact follow-up is due. A booking with both conditions counts once in the badge. The panel shows five bookings and links to the relevant filtered queue. It refreshes after payment changes, when the CRM regains focus, and every five minutes; it does not send messages or emails.

The **Cost & Profit** page is available to Super Admin and Finance accounts. Open a quotation to enter *estimated* supplier costs, or a booking to enter *actual* supplier costs. Cost entries are stored separately from client quotations and invoices, and require `cost.view` to read or `cost.manage` to change. A Super Admin can grant these permissions to another admin. Costs never appear in customer PDFs.

Enter each supplier amount in its own currency. If it differs from the quotation or booking currency, enter the rate as **one supplier currency unit in the selling currency**. For example, if the client price is in USD and one LKR is worth 0.0033 USD, enter `0.0033` for an LKR cost. This rate is saved on the entry; the CRM does not fetch live exchange rates. Changing a sale currency flags old costs for review and hides profit until they are revalued. The summary uses `profit = client selling price − recorded costs` and `margin = profit / client selling price`. No profit is shown before any costs are entered. Booking profit uses the full booked selling price, while actual cash received and refunds remain in Payment Reports.

For **actual booking costs**, enter an optional supplier payment due date, then use **Payments** on a saved cost to record each deposit with its Sri Lanka payment date, method, optional reference and note. The history records the staff member and time; previous paid totals remain as unitemized opening balances. Use **Correct paid total** only for adjustments, which are also recorded in history. Staff with `cost.view` can read the history; `cost.manage` is required to record a payment at `POST /api/finance/costs/:id/payments`. Payments cannot exceed the remaining amount, be dated in the future, or be recorded on quotation estimates. A cost with recorded payments cannot be deleted or changed to another currency; reconcile the history with bank records. Cost and payment actions appear in booking activity without exposing private supplier amounts there.

The cost table shows what remains in each supplier's currency; it never adds different currencies together. The booking tab has a paged **Supplier payment schedule** with filters for overdue, due soon (overdue plus today through the next six Sri Lanka calendar days), later, no due date, and all unpaid costs. It shows the filtered remaining total separately by currency, 25 costs per page, and links to the booking. Costs without dates do not appear in the header alert; set a date so Finance can plan payment. `GET /api/finance/costs/schedule` requires `cost.view` and accepts `filter`, `page`, and `limit` (up to 50). The header's **Supplier dues** alert remains limited to overdue and due soon, up to 50 earliest entries, and refreshes after cost and payment edits, when the CRM regains focus, every five minutes, or manually. Fully paid costs leave the schedule. Bookings with supplier payments or correction history cannot be deleted; cancel the booking to preserve its payment record.

The booking tab also has a **Supplier payment register** for matching recorded deposits to bank records. Filter by inclusive payment dates (Sri Lanka calendar, up to 366 days) and a case-insensitive payment reference, then open the linked booking or export all matching payments as CSV. The default view is the current Sri Lanka month, with 25 payments per page and separate totals for each supplier currency. Unitemized opening balances and manual paid total corrections are excluded because they are not individual cash payments. `GET /api/finance/costs/payment-register` requires `cost.view`; `/payment-register/export` additionally requires `report.export` and allows up to 10,000 matching rows per download. Narrow the filter for larger exports.

### 🤖 AI Tools

- Generate client replies
- Generate travel itineraries
- Create professional itinerary content
- Improve response quality and speed
- Support configurable OpenAI models

### 🚐 DMC Operations

- Manage destinations
- Manage tour packages
- Manage vehicles
- Configure company information
- Configure PDF branding and payment instructions
- Connect the CRM with a future public website

### 📊 Analytics and Monitoring

- Dashboard statistics
- Upcoming departures for the next 30 days, with shortcuts to each booking
- Bookings needing attention for upcoming departures with requested hotel stays, unfinished preparation tasks, and overdue task counts
- My Tasks view for each admin's assigned preparation work, with due-date and high-priority filters and quick completion
- Team Tasks view for open work across active bookings, including unassigned tasks and safe self-assignment
- Header alerts for assigned tasks due today or overdue, updated after checklist changes and while the CRM is open
- Revenue and booking charts
- Recent activity panel
- Follow-up alerts
- Searchable activity logs
- Administrator action tracking

### 🔐 Security and Administration

- JWT authentication
- Password hashing with bcrypt
- Email code password recovery with one-time reset and session revocation
- Backend permission enforcement
- Frontend route and action guards
- Administrator account activation
- Custom permissions
- Login rate limiting
- Public inquiry rate limiting
- Helmet security headers
- Configurable production CORS
- Environment validation
- Safe production error handling

---

## 🛡️ Administrator Roles

| Role | Main Access |
|---|---|
| 👑 **Super Admin** | Complete system and administrator control |
| 🧭 **Manager** | Business operations and management |
| 💼 **Sales** | Inquiries, quotations, bookings, and follow-ups |
| 💰 **Finance** | Payments, refunds, and financial reports |
| 👁️ **Viewer** | Read-only operational access |

Custom permissions can be added to individual administrator accounts.

---

## 🧰 Technology Stack

<div align="center">

<table>
<tr>
<td align="center" width="110">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nodejs/nodejs-original.svg" width="45" alt="Node.js"/><br/>
<b>Node.js</b>
</td>
<td align="center" width="110">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/express/express-original.svg" width="45" alt="Express"/><br/>
<b>Express</b>
</td>
<td align="center" width="110">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/mongodb/mongodb-original.svg" width="45" alt="MongoDB"/><br/>
<b>MongoDB</b>
</td>
<td align="center" width="110">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg" width="45" alt="React"/><br/>
<b>React</b>
</td>
<td align="center" width="110">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/vitejs/vitejs-original.svg" width="45" alt="Vite"/><br/>
<b>Vite</b>
</td>
<td align="center" width="110">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/bootstrap/bootstrap-original.svg" width="45" alt="Bootstrap"/><br/>
<b>Bootstrap</b>
</td>
</tr>
<tr>
<td align="center" width="110">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg" width="45" alt="JavaScript"/><br/>
<b>JavaScript</b>
</td>
<td align="center" width="110">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/git/git-original.svg" width="45" alt="Git"/><br/>
<b>Git</b>
</td>
<td align="center" width="110">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/github/github-original.svg" width="45" alt="GitHub"/><br/>
<b>GitHub</b>
</td>
<td align="center" width="110">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/postman/postman-original.svg" width="45" alt="Postman"/><br/>
<b>Postman</b>
</td>
<td align="center" width="110">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/html5/html5-original.svg" width="45" alt="HTML5"/><br/>
<b>HTML5</b>
</td>
<td align="center" width="110">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/css3/css3-original.svg" width="45" alt="CSS3"/><br/>
<b>CSS3</b>
</td>
</tr>
</table>

</div>

### Backend

- Node.js
- Express.js
- MongoDB Atlas
- Mongoose
- JSON Web Tokens
- bcryptjs
- OpenAI API
- pdf-lib
- Helmet
- Express Rate Limit
- CORS
- dotenv

### Frontend

- React
- Vite
- React Router DOM
- Axios
- Bootstrap
- React Icons
- Recharts

---

## 🏗️ System Architecture

```mermaid
flowchart LR
    A[React CRM Frontend] -->|Axios / HTTPS| B[Express REST API]
    B --> C[(MongoDB Atlas)]
    B --> D[OpenAI API]
    B --> E[PDF Generation]
    F[Future Next.js Website] -->|Public API| B
```

---

## 📂 Project Structure

```text
dream-ceylon-crm/
│
├── backend/
│   ├── assets/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── scripts/
│   ├── utils/
│   ├── .env.example
│   ├── package.json
│   └── server.js
│
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── api/
│   │   ├── components/
│   │   ├── config/
│   │   ├── context/
│   │   ├── layouts/
│   │   └── pages/
│   ├── .env.example
│   └── package.json
│
├── docs/
│   ├── API_DOCUMENTATION.md
│   ├── DEPLOYMENT_GUIDE.md
│   ├── PROJECT_FEATURES.md
│   ├── PRODUCTION_CHECKLIST.md
│   └── SECURITY.md
│
├── postman/
├── README.md
└── SECURITY.md
```

---

## ⚙️ Local Installation

### 1️⃣ Clone the Repository

```bash
git clone YOUR_REPOSITORY_URL
cd dream-ceylon-crm
```

### 2️⃣ Install Backend Dependencies

```bash
cd backend
npm install
```

Create the backend environment file:

```bash
copy .env.example .env
```

Configure:

```env
NODE_ENV=development
PORT=5000

MONGO_URI=your_mongodb_connection_string

JWT_SECRET=your_long_random_jwt_secret
JWT_EXPIRES_IN=30d

OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=your_model_name

CLIENT_URL=http://localhost:5173
CLIENT_URLS=http://localhost:5173

# Zoho CPaaS transactional email Agent
ZOHO_CPaaS_API_KEY=your_send_api_key
ZOHO_CPaaS_FROM=admin@dreamceylonjourneys.com
ZOHO_CPaaS_API_URL=https://cpaas.zoho.com/v1.1/email
```

Start the backend:

```bash
npm run dev
```

### Password recovery and business email

1. Create `admin@dreamceylonjourneys.com` in Zoho Mail after verifying the domain and configuring its incoming MX records. Make sure the mailbox receives messages.
2. While signed in as a Super Admin, change the CRM account email in **Admins** to that mailbox. The login screen no longer fills in a sample account. Existing accounts are not changed automatically.
3. Sign up for **Zoho CPaaS** (formerly ZeptoMail) directly at [cpaas.zoho.com](https://cpaas.zoho.com/). The Transactional Emails shortcut inside Zoho Mail Admin Console is only available with paid Zoho Mail/Workplace plans; a Zoho Mail Free mailbox can still receive OTPs sent through a separate CPaaS account. Verify the sending domain in CPaaS using the DKIM and CNAME records it provides, associate that domain with an Agent, and copy the Agent's **Send API key** from **SMTP/API → API Setup**. Zoho Mail's normal SMTP is not intended for automated OTP messages.
4. Set `ZOHO_CPaaS_API_KEY` and `ZOHO_CPaaS_FROM` in the backend environment. Set `ZOHO_CPaaS_API_URL` to the Agent's regional `/v1.1/email` endpoint if it differs from the example. Restart the backend. Never put the Send API key in the frontend or in Git.
5. On the sign-in page, choose **Forgot your password?** and enter the account email. The six-digit code lasts 10 minutes; a new code can be sent after 60 seconds. Five incorrect attempts invalidate a code. Verification permits one password change within 10 minutes and ends prior login sessions. New passwords need at least 12 characters (at most 72 UTF-8 bytes).

The request endpoint returns the same confirmation for unknown and known addresses. With no transactional email configuration, it returns 503 so an unavailable recovery service is visible. A Super Admin can also reset another admin's password in **Admins**.

If the form confirms but the code never arrives, wait 60 seconds, request it again, and inspect the **backend terminal**. An `accepted by Zoho CPaaS` entry means Zoho accepted the request; check the Agent's **Processed emails** for delivery or bounce details, then the mailbox's Spam folder. A `delivery failed` entry includes the HTTP status and Zoho error code; compare that code with [Zoho CPaaS API error codes](https://www.zoho.com/cpaas/help/api/error-codes.html). For example, `SERR_157` means an invalid Agent Send API key, `SM_111` indicates the sending domain is not verified for that Agent, and `SM_128` means the CPaaS account still needs review. If neither line appears, verify that the CRM account is **Active**, its email in **Admins** exactly matches the address entered, and the one-minute resend cooldown has passed. The Send API key must be the Agent's key, without the `Zoho-enczapikey` prefix; the backend adds that prefix. With Sender Address Restriction enabled, `ZOHO_CPaaS_FROM` must exactly match an allowed address associated with that Agent. A **sandbox Agent** records test emails but never delivers them to a real inbox; use a live Agent for OTPs.

| Step | Endpoint | JSON body |
|---|---|---|
| Request code | `POST /api/auth/forgot-password` | `{ "email": "admin@dreamceylonjourneys.com" }` |
| Verify code | `POST /api/auth/verify-reset-code` | `{ "email": "...", "code": "123456" }` |
| Change password | `POST /api/auth/reset-password` | `{ "email": "...", "resetToken": "...", "password": "..." }` |

### 3️⃣ Install Frontend Dependencies

Open a new terminal:

```bash
cd frontend
npm install
```

Create:

```bash
copy .env.example .env
```

Use:

```env
VITE_API_URL=http://localhost:5000/api
```

Start the frontend:

```bash
npm run dev
```

---

## 🌐 Development URLs

| Service | URL |
|---|---|
| 🖥️ Frontend | `http://localhost:5173` |
| ⚙️ Backend API | `http://localhost:5000` |
| ❤️ Health Check | `http://localhost:5000/api/health` |
| 🔓 Public API | `http://localhost:5000/api/public` |

---

## ❤️ API Health Check

```http
GET /api/health
```

Example response:

```json
{
  "status": "ok",
  "service": "Dream Ceylon CRM",
  "version": "1.0.0",
  "environment": "development",
  "database": "connected"
}
```

---

## 🔌 Main API Modules

Guest pickup drafts use `GET /api/bookings/:id/transport-assignments/:assignmentId/guest-message` with both `booking.view` and `booking.update` permissions. The transfer must belong to the booking and be confirmed; the booking must be pending, confirmed, or in progress. The response contains only the guest name/number, booking reference, message, and missing-detail labels, and disables caching. Invalid IDs return 400, missing records return 404, and inactive bookings or unconfirmed transfers return 409. The endpoint is read-only and does not contact WhatsApp or send messages.

Hotel vouchers use `POST /api/booking-pdf/hotel-voucher/:id/:stayId` with `booking.view` and `pdf.generate` permissions. The hotel stay must belong to the booking and be confirmed. The response is a non-cacheable PDF attachment; missing records return 404 and an unconfirmed stay or cancelled booking returns 409. The existing hotel confirmation is independent of the tour's overall status, so confirmed stays can be printed while the tour is pending or reprinted after completion. No automatic email is sent.

| Module | Base Route |
|---|---|
| 🔐 Authentication | `/api/auth` |
| 👑 Administrators | `/api/admins` |
| 🗺️ Destinations | `/api/destinations` |
| 🎒 Packages | `/api/packages` |
| 📩 Inquiries | `/api/inquiries` |
| 📅 Bookings | `/api/bookings` |
| 🧾 Quotations | `/api/quotations` |
| 💳 Payments | `/api/booking-payments` |
| 📄 Payment Receipts | `/api/payment-receipts` |
| 📌 Follow-Ups | `/api/follow-ups` |
| 👥 Customers | `/api/customers` |
| 🚐 Vehicles | `/api/vehicles` |
| 💰 Finance | `/api/finance` |
| ⚙️ Settings | `/api/settings` |
| 🧠 AI Tools | `/api/ai` |
| 📑 PDF Tools | `/api/pdf` |
| 📜 Activity Logs | `/api/activity-logs` |
| 🌍 Public Website API | `/api/public` |

---

## 🌍 Public Website API

The CRM is ready to connect with a future Next.js tourism website.

```http
GET  /api/public/home
GET  /api/public/destinations
GET  /api/public/destinations/:id
GET  /api/public/packages
GET  /api/public/packages/:id
GET  /api/public/vehicles
POST /api/public/inquiries
```

The public inquiry endpoint includes rate limiting. CAPTCHA protection should be added when the website is deployed.

---

## 🧪 Testing

The project includes a complete Postman test collection covering:

- Authentication
- Public API access
- Super Admin permissions
- Manager restrictions
- Sales restrictions
- Finance permissions
- Viewer restrictions
- Protected backend routes

### Final Test Result

```text
✅ Passed: 39
❌ Failed: 0
⚠️ Errors: 0
```

---

## 🔒 Security Highlights

- ✅ Public administrator registration disabled
- ✅ Passwords hashed with bcrypt
- ✅ JWT authentication
- ✅ Role-based permissions
- ✅ Custom administrator permissions
- ✅ Frontend route protection
- ✅ Backend API authorization
- ✅ Helmet headers
- ✅ Login rate limiting
- ✅ Public inquiry rate limiting
- ✅ Production CORS allowlist
- ✅ Safe error responses
- ✅ Environment validation
- ✅ Activity auditing

> [!IMPORTANT]
> Never commit `.env`, database credentials, API keys, real passwords, customer exports, or database backups.

---


## 🛣️ Roadmap

- [x] Authentication
- [x] Destination management
- [x] Package management
- [x] Inquiry management
- [x] Customer profiles
- [x] Quotations
- [x] Booking management
- [x] Payment management
- [x] Supplier costs and profit tracking
- [x] Follow-ups
- [x] PDF documents
- [x] AI tools
- [x] Dashboard analytics
- [x] Activity logs
- [x] Multi-admin roles
- [x] Permission enforcement
- [x] Production security
- [x] Postman testing
- [ ] Next.js tourism website
- [ ] Website content management
- [ ] Cloud image storage
- [ ] Email notifications
- [ ] Multilingual website content
- [ ] Website analytics

---

## 📚 Documentation

| Document | Description |
|---|---|
| 📘 `docs/API_DOCUMENTATION.md` | API endpoints and usage |
| 🚀 `docs/DEPLOYMENT_GUIDE.md` | Production deployment instructions |
| 🛡️ `docs/SECURITY.md` | Security policy and requirements |
| ✅ `docs/PRODUCTION_CHECKLIST.md` | Final deployment checklist |
| ✨ `docs/PROJECT_FEATURES.md` | Complete feature summary |

---

## 🤝 Contribution

This is a private business project developed for Dream Ceylon Journeys.

For internal development:

```bash
git checkout -b feature/feature-name
git add .
git commit -m "Add feature description"
git push origin feature/feature-name
```

---

## 👨‍💻 Developer

**Janith Dasanayaka**

Software Engineering Student • Full-Stack Developer

---

## 🏢 Project

**Dream Ceylon Journeys**  
Sri Lankan Destination Management Company

---

## 📄 License

This project is currently maintained as private software for Dream Ceylon Journeys.

---

<div align="center">

### 🌴 Dream Ceylon CRM

**Smarter travel operations. Better customer experiences.**

Made with ❤️ in Sri Lanka 🇱🇰

</div>

## DevOps foundation

See [docs/DEVOPS.md](docs/DEVOPS.md) for the automated checks, Docker setup, current limitations, and the AWS/Jenkins/Kubernetes roadmap.
