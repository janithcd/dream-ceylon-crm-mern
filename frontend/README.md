# Dream Ceylon CRM frontend

The staff interface for Dream Ceylon CRM, built with React, Vite and Bootstrap.

[Project overview and setup](../README.md) · [Feature guide](../PROJECT_FEATURES.md) · [CI and Docker](../docs/DEVOPS.md)

## Local development

Use Node.js 24 or 22.12+. From this directory:

```bash
npm ci
npm run dev
```

Copy [`.env.example`](.env.example) to `.env` on a fresh checkout and set `VITE_API_BASE_URL` to the backend URL, including `/api`. The default local API is `http://localhost:5000/api`; the default Vite page is `http://localhost:5173`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm test` | Run frontend regression tests. |
| `npm run lint:runtime` | Run the required runtime lint checks. |
| `npm run lint` | Report the full lint ruleset, including existing debt. |
| `npm run build` | Create the production build in `dist/`. |
| `npm run preview` | Preview the built application locally. |

Vite environment values are included in the browser build. Keep database credentials and provider keys in the backend environment.
