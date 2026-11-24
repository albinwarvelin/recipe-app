# Recipe App

Private, single-user, local-first recipe PWA on Cloudflare Workers, D1, and R2.

## Current status

The app has a card-based responsive frontend, dedicated recipe views/editors, Dexie persistence, durable local-first writes, dependency-aware synchronization, manual conflict resolution, and an Access-aware offline shell. Cover photos accept JPEG, PNG, WebP, HEIC, and HEIF input. The device prepares a JPEG cover (maximum 2560-pixel edge) and JPEG thumbnail (720-pixel edge) once, removes source metadata, and saves both locally before synchronization. Both variants are stored in private EU-jurisdiction R2 and downloaded directly by other devices. Native HEIC decoding is tried first; one lazy decoder handles unsupported browsers. No image-transformation service is used.

Cloudflare Access protects the complete `workers.dev` deployment with email one-time PIN login, and the Worker independently validates every API request before reading D1 or R2. Once opened successfully, cached recipes and thumbnails remain usable offline. Unsynchronized writes are never discarded after retry or authentication failure.

Production: `https://recipe-app-api.albin-warvelin.workers.dev/`

## Structure

- `src/` — React/Vite PWA, Dexie repositories, image processing, and synchronization coordinator.
- `worker/` — Cloudflare Worker authentication, validation, routes, D1 data layer, and private R2 image streaming.
- `migrations/` — D1 database schema.
- `tests/` — Node security/local-first tests and Workers-runtime D1/R2 tests.
- `agent_docs/` — project requirements and architecture guidance.

## Development

```sh
npm install
npx wrangler d1 migrations apply recipe-app --local
npm run dev
npm run worker:dev
npm test
npm run build
```

Copy `.dev.vars.example` to `.dev.vars` for local placeholders. Never commit `.dev.vars`, API keys, Access tokens, or other secrets. Local API calls remain unauthorized unless they carry a valid Access JWT; there is no development authentication bypass.

## Deployment

```sh
npm run build
npx wrangler d1 migrations apply recipe-app --remote
npx wrangler deploy
```

Apply D1 migrations and provision configured bindings before deploying code that depends on them. See `docs/DEPLOYMENT.md` for the full checklist.
