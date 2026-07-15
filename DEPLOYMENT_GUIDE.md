# Deployment Guide

## Recommended Architecture

```text
React CRM Frontend
        ↓ HTTPS
Express API
        ↓
MongoDB Atlas
```

The future Next.js website can use the same public API without sharing CRM authentication.

## Backend Environment

```env
NODE_ENV=production
PORT=5000
MONGO_URI=...
JWT_SECRET=...
OPENAI_API_KEY=...
OPENAI_MODEL=...
CLIENT_URLS=https://crm.your-domain.com
APP_NAME=Dream Ceylon CRM
APP_VERSION=1.0.0
```

Store values in the hosting provider's environment settings. Do not upload `.env`.

## Backend

```powershell
npm ci
npm start
```

Confirm `package.json` contains:

```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  }
}
```

Verify:

```http
GET /api/health
```

## Frontend

```env
VITE_API_BASE_URL=https://api.your-domain.com/api
```

Build:

```powershell
npm ci
npm run build
```

Publish the generated `dist` folder.

## CORS

Single frontend:

```env
CLIENT_URLS=https://crm.your-domain.com
```

Multiple trusted frontends:

```env
CLIENT_URLS=https://crm.your-domain.com,https://www.dreamceylonjourneys.com
```

## MongoDB Atlas

- Use a dedicated production database user
- Grant only required permissions
- Restrict network access
- Enable backups where available
- Store the connection string as a secret

## Production Tests

- Health endpoint returns 200
- Login works
- Inactive accounts are blocked
- Role permissions work
- PDFs download
- AI features work
- Public APIs work
- Public inquiry works
- Activity logs are created
- Unknown origins are blocked

## Rollback

- Create a database backup
- Tag the stable Git commit
- Keep the previous frontend build
- Record environment variable names
