# Recipe App

Private, single-user, local-first recipe PWA.

## Status

This repository contains the Milestone 1 project outline and a fail-closed security boundary. The browser shell is intentionally minimal. Cloudflare Access authenticates users, and the Worker independently validates each Access JWT before serving API data.

## Structure

- `src/` — React/Vite PWA shell, feature boundaries, local database seams, and styles.
- `worker/` — Cloudflare Worker, authentication, middleware, routes, services, validation, security, and database seams.
- `migrations/` — versioned D1 migrations.
- `tests/` — unit, integration, and end-to-end test locations.
- `AGENTS.md` — project requirements and security rules.

## Development

```sh
npm install
npm run dev
npm run test
npm run build
```

Copy `.env.example` or `.dev.vars.example` for local placeholders. Never commit real secrets or `.dev.vars`.

## Security note

The static app shell contains no private data, and all `/api/*` routes are private by default. Recipe data must not be placed in static assets. The Worker validates Cloudflare Access JWT signature, issuer, audience, expiration, not-before, subject, and the approved-email allowlist.
