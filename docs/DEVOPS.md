# CRM DevOps practical project

## First milestone

Every push, pull request, or manual workflow run executes:

1. Dependency security audits (high/critical issues fail CI), backend syntax checks and Node's built-in test suite with coverage on Node 22 and 24.
2. A production frontend build on Node 24.
3. Docker image builds and smoke tests of the React/Nginx frontend, Express API and disposable MongoDB database.

The workflow has read-only repository permission and needs no AWS, OpenAI or production database credentials. Container images are built for verification; they are not published or deployed yet. See `.github/workflows/ci.yml` and the [Actions page](https://github.com/janithcd/dream-ceylon-crm-mern/actions).

Tests cover authentication failures, inactive/deleted administrators, all permission helpers, role restrictions, CORS/preflight, security headers, startup configuration, database readiness, public registration restrictions, malformed JSON and document dates across host timezones. The health tests simulate database state; container smoke tests use an actual disposable MongoDB instance. This is the first regression suite, not full business-flow coverage.

## Run checks locally

Use Node 24 (`.nvmrc`) or Node 22.12+. `npm run dev` uses Node’s built-in watch mode, replacing nodemon and its vulnerable watcher dependencies.

```bash
cd backend
npm ci
npm run check
npm run test:coverage
cd ../frontend
npm ci
npm run build
npm run lint
```

Frontend lint currently reports pre-existing errors and warnings. CI records it as a non-blocking step while backend tests, builds and smoke tests must succeed. Refactor this debt before making lint a required gate. Do not interpret a green build as a passing frontend lint check.

## Run the isolated Docker environment

Install Docker with Compose v2. From the repository root, set a random local-only JWT secret of at least 32 characters, then start:

PowerShell:

```powershell
$env:JWT_SECRET = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
docker compose up --build --wait
```

Bash:

```bash
export JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
docker compose up --build --wait
```

Open http://localhost:8080. This creates an empty local development database, independent of Atlas. No existing business accounts are imported; authenticate only after provisioning a local development administrator. Public self-registration stays disabled.

```bash
node scripts/smoke-test.mjs
docker compose down
```

`docker compose down` preserves local named volumes. The CI cleanup additionally removes volumes because its data is disposable. Avoid copying that cleanup command into an environment whose data you need.

The frontend proxies `/api` and `/uploads` to the backend and supports React Router page refreshes. MongoDB and the API have no published host ports. Only the frontend is exposed, bound to local loopback. Both application images run as non-root users. Uploads use a named volume.

AI features require a separately injected OpenAI key; they are not exercised by these checks. Compose is a local/CI lab with unauthenticated private MongoDB, HTTP and one API replica. It is not a production deployment manifest.

## Configuration and health probes

`VITE_API_BASE_URL` is the frontend build-time setting; the existing `VITE_API_URL` is still accepted for compatibility. Vite values are public browser configuration, so never put secrets in them. Container builds default to `/api`.

`GET /api/health/live` reports HTTP process liveness. `GET /api/health` retains its existing contract: 200 with MongoDB connected, 503 otherwise. Use separate liveness/readiness probes when adding Kubernetes. Startup still validates secrets and connects to MongoDB before listening, and SIGTERM closes HTTP and database connections.

PDF date formatting uses the explicit `Asia/Colombo` business timezone. Date-only form inputs and their MongoDB UTC serialization render on the same Sri Lankan calendar date regardless of host timezone. This does not migrate older records or recover dates already saved incorrectly. Timestamped documents use the Sri Lankan date at generation time.

## Next milestones

1. Add database-backed business-flow tests for successful login, inquiry → quotation → booking → payment, and PDF content. Resolve frontend lint and reduce bundle size. Complete the public-inquiry anti-spam requirement.
2. Set an AWS budget, region and target architecture; provision a staging environment and container registry with infrastructure as code. Keep the Namecheap domain registration and plan DNS/email migration separately.
3. Add AWS deployment using short-lived GitHub OIDC credentials, a staging environment, health checks and a rollback path. Review database backups and upload persistence before cutover.
4. Build a Jenkins pipeline using the same checks and containers. Run it on a dedicated learning agent; do not expose a Jenkins server to production traffic.
5. Add a local Kubernetes lab, manifests with readiness/liveness, resource limits, secrets and ingress, then evaluate an AWS Kubernetes environment against the budget.
6. Migrate the public website after staging, SSL, URLs, inquiry integration, SEO redirects, DNS and email records are verified.

No AWS resources, DNS changes, Jenkins server or Kubernetes cluster are provisioned by this first milestone.
