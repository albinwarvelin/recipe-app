# Recipe App

Private, single-user, local-first recipe PWA.

## Status

This repository contains the Milestone 1 project outline and a fail-closed security boundary. The browser shell is intentionally minimal. The Worker does not accept tokens until Cloudflare Access JWT validation is implemented.

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

The static app shell may be public, but all `/api/*` routes are private by default. Recipe data must not be placed in static assets. Before adding data routes, implement and test Cloudflare Access JWT signature, issuer, audience, expiration, not-before, and approved-owner validation.
