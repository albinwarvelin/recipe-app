# Local development and Cloudflare deployment

## Deployment shape

Vite builds `src/` into `dist/`. One Worker serves those assets and handles relative `/api/*` calls, so the frontend and API share `https://recipe-app-api.albin-warvelin.workers.dev`. D1 and the private EU R2 bucket are available only through Worker bindings.

Cloudflare Access is the outer gate for the production and preview URLs. The Worker is the inner gate for every API route. The static shell contains no private recipe data.

The custom service worker uses network-first navigation. It caches the HTML shell and versioned assets only after the Worker marks a response as a genuine app asset and the authenticated frontend requests caching. Online navigation therefore still reaches Access for login/session refresh, while a network failure falls back to the verified cached shell. API responses are never placed in Cache Storage; recipes and image blobs use IndexedDB.

## Access configuration

The Cloudflare dashboard must keep both Production and Preview Worker URLs restricted. Both Access applications should allow only the exact owner email, use email one-time PIN, use the intended session lifetime, and remain enabled after deployment.

`wrangler.jsonc` contains separate production/preview AUD tags. These values and the owner email are identifiers/configuration, not authentication secrets. Do not store Access cookies or JWTs.

## Local checks

```sh
npm install
npm run worker:types
npx wrangler d1 migrations apply recipe-app --local
npm run lint
npm test
npm run build
npx wrangler deploy --dry-run
```

The Node suite checks JWT/boundary behavior, IndexedDB durability and operation collapsing, and byte-level image validation. The Workers suite runs recipe and R2 image persistence against local bindings with all migrations applied.

Local requests without a valid Access assertion fail closed. Do not add a development authentication bypass. The deployed app is the practical authenticated end-to-end target.

## Production release

Authenticate Wrangler without placing an API token in the repository, then apply schema before code:

```sh
npx wrangler login
npx wrangler whoami
npx wrangler d1 migrations list recipe-app --remote
npx wrangler d1 migrations apply recipe-app --remote
npm run build
npx wrangler deploy
```

Never edit a migration already applied remotely; add the next numbered migration. After deployment, verify while signed out that `/` and `/api/session` redirect to Access, then sign in and exercise offline creation, reconnect/sync, cover upload, edit, favorite, deletion, and a two-client version conflict. Confirm that a previously opened app launches offline and renders IndexedDB data.

The optional example library is stored in `scripts/seed-example-recipes.sql`. It uses fixed UUIDs and `INSERT OR IGNORE`, so `npx wrangler d1 execute recipe-app --remote --file scripts/seed-example-recipes.sql` is safe to rerun without duplicating the four recipes. Every example has `source_name = 'Recipe App examples'` and an `Example` tag.

Observe logs with `npx wrangler tail recipe-app-api`. Worker logs include request ID, method, route, status, and duration, but never JWTs, emails, request bodies, or recipe content.

If a future integration needs a secret, use `npx wrangler secret put NAME`. Never place secret values in `wrangler.jsonc`, frontend variables, `.env`, or Git.
