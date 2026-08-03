# Recipe App

Private, single-user recipe PWA on Cloudflare Workers and D1.

## Current status

The protected backend and a temporary online API-testing frontend are implemented. Cloudflare Access protects the complete `workers.dev` deployment with email one-time PIN login, and the Worker independently validates every API request before reading D1.

The tester supports recipe creation, full editing, ordered ingredients and instructions, case-insensitive tags, favorites, soft deletion, version conflicts, and the incremental change cursor. It intentionally does not claim local-first/offline editing yet; Dexie and the persistent browser outbox remain later frontend work.

Production: `https://recipe-app-api.albin-warvelin.workers.dev/`

## Structure

- `src/` — React/Vite PWA and temporary direct API tester.
- `worker/` — Cloudflare Worker authentication, validation, routes, and D1 data layer.
- `migrations/` — append-only D1 migrations.
- `tests/` — Node security/unit tests and Workers-runtime D1 tests.
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

The D1 migration should be applied before deploying code that depends on it. See `docs/DEPLOYMENT.md` for the full checklist.
