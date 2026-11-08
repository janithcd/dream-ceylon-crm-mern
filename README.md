<div align="center">

# 🌴 Dream Ceylon CRM

**Travel operations and customer management for Dream Ceylon Journeys**

From the first inquiry to the final guest follow-up, in one MERN application.

[![CRM CI](https://github.com/janithcd/dream-ceylon-crm-mern/actions/workflows/ci.yml/badge.svg)](https://github.com/janithcd/dream-ceylon-crm-mern/actions/workflows/ci.yml)
![Node.js](https://img.shields.io/badge/Node.js-22.12%2B%20%7C%2024-339933?logo=nodedotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-47A248?logo=mongodb&logoColor=white)

[Features](#features) · [Quick start](#quick-start) · [Development](#development) · [Documentation](#documentation)

</div>

## Overview

Dream Ceylon CRM is the internal sales, finance and tour operations platform for **Dream Ceylon Journeys**, a Sri Lankan Destination Management Company. It brings inquiries, quotations, bookings, supplier arrangements, payments and guest care into one workspace.

The application includes permissions for different staff roles, branded PDF documents, reviewed email and WhatsApp drafts, and public APIs for website integration. Operational dates and reminders use **Asia/Colombo**.

## Features

| Area | What you can do |
| --- | --- |
| **Sales and customers** | Capture inquiries, assign leads, review customer history, schedule follow-ups and track conversion. |
| **Quotations** | Prepare offers, set validity dates, compare revisions, generate PDFs and convert accepted offers into bookings. |
| **Bookings and operations** | Plan itineraries, traveler rosters, hotel stays, rooming plans, transport and airport transfers. |
| **Team coordination** | Assign preparation tasks, review departure readiness, record supplier contact and share private handover notes. |
| **Guest finance** | Record receipts and refunds, manage collection targets, match bank entries, issue guest payment statements and review payment confirmation emails. |
| **Supplier finance** | Estimate costs from supplier rates, review booking costs and private supplier invoices across bookings, track due dates, profit and payments, match transfers and generate vouchers with email drafts. |
| **Supplier directory** | Search hotels, guides, safari jeep providers and partners; keep contacts, dated rate cards and internal terms, and copy hotel details into booking stays. |
| **Activities & excursions** | Reserve safaris, guides, trains and experiences; track confirmations, cancellations and follow-ups, view the operations schedule and prepare supplier/guest messages. |
| **Guest care** | Manage issues during trips, follow up after departure, collect feedback and track service recovery. |
| **Documents and AI** | Generate branded quotations, invoices, receipts, itineraries and hotel vouchers; draft replies and itineraries with AI. |
| **Administration** | Manage staff access, company branding, destinations, packages, vehicles, reports and activity history. |

See the [feature guide](PROJECT_FEATURES.md) for module details and links to operating instructions.

### Staff roles

| Role | Default focus |
| --- | --- |
| Super Admin | Full system access and administrator management |
| Manager | Sales, bookings and operational oversight |
| Sales | Inquiries, quotations, bookings and follow-ups |
| Finance | Guest payments, supplier costs and financial reports |
| Viewer | Read-only access to permitted operational screens |

A Super Admin can grant additional permissions. The backend enforces access; the UI shows the actions available to the signed-in user.

## Technology

| Layer | Stack |
| --- | --- |
| Frontend | React 19, Vite, React Router, Bootstrap, Axios, Recharts |
| Backend | Node.js, Express, Mongoose, JWT, bcrypt |
| Database | MongoDB / MongoDB Atlas |
| Documents | PDFKit, pdf-lib, embedded Noto fonts |
| Optional integrations | OpenAI for AI tools; Zoho CPaaS for password recovery and guest payment emails |
| Development and delivery | Node test runner, ESLint, GitHub Actions, Docker Compose, Nginx |

## Quick start

### 1. Prerequisites and clone

Use **Node.js 24** (see [`.nvmrc`](.nvmrc)) or **Node.js 22.12+**, npm, Git, and a MongoDB database for development.

```bash
git clone https://github.com/janithcd/dream-ceylon-crm-mern.git dream-ceylon-crm
cd dream-ceylon-crm
npm --prefix backend ci
npm --prefix frontend ci
```

### 2. Configure the environment

On a fresh clone, copy both templates. Keep your existing `.env` files when updating the application.

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

On macOS or Linux, use `cp` in place of `Copy-Item`.

| File | Required local configuration |
| --- | --- |
| `backend/.env` | Set `MONGO_URI` and a random `JWT_SECRET`. Keep `NODE_ENV=development`, `PORT=5000` and the client URLs set to `http://localhost:5173`. |
| `frontend/.env` | Set `VITE_API_BASE_URL=http://localhost:5000/api`. |

Generate a secret locally, then put its output in `JWT_SECRET`:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

AI tools and password recovery need their respective provider settings. Leave unused integration keys blank. See the [backend template](backend/.env.example), [frontend template](frontend/.env.example) and [account recovery guide](docs/ACCOUNT_RECOVERY.md).

### Guest payment emails

Open a booking's **Payment History**, select the envelope on a received payment, and review the recipient, subject, text and two PDF attachments. For PayHere, enter the **verified total card charge** (including any processing fee); the preview separates that fee from the amount applied to the tour. The statement must reconcile before the action is available. The email goes only to the address saved on the booking. The send action requires `payment.email.send`, available by default to Super Admin, Manager and Finance.

Automatic sending uses the **Zoho CPaaS Email API**, which requires a verified domain and Agent API key in `backend/.env`. A Zoho Mail mailbox alone does not enable the CRM send button. When CPaaS is unconfigured, copy the reviewed email, download the receipt and statement, and attach them manually in Zoho Mail. The CRM records the provider acceptance and blocks duplicate or uncertain sends for the same payment; acceptance is not proof of delivery, so check Zoho logs if delivery is in doubt. Never send the quotation or an invoice automatically with this payment confirmation.

### 3. Start both applications

Run each command in a separate terminal, from the repository root:

```bash
npm --prefix backend run dev
```

```bash
npm --prefix frontend run dev
```

| Service | Local address |
| --- | --- |
| CRM | [http://localhost:5173](http://localhost:5173) |
| API readiness | [http://localhost:5000/api/health](http://localhost:5000/api/health) |
| API liveness | [http://localhost:5000/api/health/live](http://localhost:5000/api/health/live) |

Sign in with a provisioned administrator account. An existing Super Admin can create staff accounts through **Admins**. A fresh database needs its first administrator provisioned through an authorized database setup; this repository has no public registration route or default login.

**Prefer Docker?** Follow the [Docker Compose setup](docs/DEVOPS.md#run-the-isolated-docker-environment) to run the frontend, API and a separate local MongoDB database at `http://localhost:8080`.

## Development

Run checks from the repository root:

```bash
npm --prefix backend run check
npm --prefix backend test
npm --prefix frontend test
npm --prefix frontend run lint:runtime
npm --prefix frontend run build
```

GitHub Actions runs dependency audits, backend checks with coverage on Node 22 and 24, frontend tests and build, and Docker smoke tests against MongoDB. View the [latest workflow runs](https://github.com/janithcd/dream-ceylon-crm-mern/actions/workflows/ci.yml) for current results.

The full frontend `npm run lint` report still contains existing lint debt and is a non-blocking CI step. Runtime lint is required. See [DevOps and testing](docs/DEVOPS.md) for coverage, containers and deployment milestones.

### Repository layout

| Path | Purpose |
| --- | --- |
| [`backend/`](backend/) | Express API, models, permissions, PDF generation and backend tests |
| [`frontend/`](frontend/) | React application, pages, components and frontend tests |
| [`docs/workflows/`](docs/workflows/) | Detailed sales, booking, guest care and finance guides |
| [`docs/`](docs/) | DevOps and account recovery setup |
| [`scripts/`](scripts/) | Application smoke checks |
| [`postman/`](postman/) | API collections and local environment examples |
| [`.github/workflows/`](.github/workflows/) | Automated CI checks |
| [`compose.yaml`](compose.yaml) | Local and CI container environment |

## Documentation

| Guide | Contents |
| --- | --- |
| [Feature guide](PROJECT_FEATURES.md) | Module overview and workflow navigation |
| [API reference](API_DOCUMENTATION.md) | Routes, authentication and request details |
| [Account recovery](docs/ACCOUNT_RECOVERY.md) | Business email settings, reset codes and delivery troubleshooting |
| [DevOps and testing](docs/DEVOPS.md) | CI, Docker, health checks and infrastructure roadmap |
| [Deployment guide](DEPLOYMENT_GUIDE.md) | Hosting configuration and release checks |
| [Server integration](SERVER_INTEGRATION.md) | Public website and API integration |
| [Production checklist](PRODUCTION_CHECKLIST.md) | Checks before a production release |
| [Release audit](docs/RELEASE_AUDIT_2026-11-02.md) | Source audit, PDF fixes, test evidence and remaining release gates |
| [Security policy](SECURITY.md) | Secrets, access control and production requirements |

## Roadmap

- AWS staging and deployment with infrastructure as code and GitHub OIDC.
- Jenkins and Kubernetes practice environments.
- Managed upload storage and production backup/restore procedures.
- Provider-backed business notifications beyond the current reviewed drafts.
- Continued lint cleanup, performance improvements and regression coverage.

CI currently builds and verifies the application; deployment remains a separate step. The [DevOps guide](docs/DEVOPS.md#next-milestones) tracks infrastructure work in more detail.

## Maintainer and project

Developed by **[Janith Dasanayaka](https://github.com/janithcd)** for **[Dream Ceylon Journeys](https://dreamceylonjourneys.com)**, Sri Lanka.

This project is maintained as private business software for Dream Ceylon Journeys. Keep credentials, customer exports and database backups out of Git; see the [security policy](SECURITY.md).

When documenting a new feature, update the relevant workflow guide and the feature index. Keep this README focused on the project overview and getting started.
