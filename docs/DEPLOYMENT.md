# Local development and Cloudflare deployment

## Deployment shape

Vite builds `src/` into `dist/`. One Worker serves those assets and handles relative `/api/*` calls, so the frontend and API share `https://recipe-app-api.albin-warvelin.workers.dev`. D1 is available only through the Worker binding.

Cloudflare Access is the outer gate for the whole production URL and all preview URLs. The Worker is the inner gate for every API route. The static shell contains no private recipe data.

The service worker may precache replaceable JavaScript, CSS, and manifest assets, but it must not precache `index.html` or intercept navigations. Otherwise a cached shell can mask the Access login page and leave API requests trapped in a pre-Worker `302` loop.

## Access configuration

The Cloudflare dashboard must keep both **Production** and **Preview** Worker URLs restricted. Both Access applications should:

1. allow only the exact owner email address;
2. use email one-time PIN as the login method;
3. use the intended Access session lifetime;
4. remain enabled after each deployment.

`wrangler.jsonc` explicitly keeps `workers_dev` and `preview_urls` enabled and contains separate production/preview AUD tags. These values and the owner email are identifiers/configuration, not authentication secrets. Do not store Access cookies or JWTs.

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

The Node suite checks JWT and boundary behavior. The Workers Vitest suite runs the recipe data layer against local D1 with all migrations applied.

Local requests without a valid Access assertion fail closed. Do not add a development authentication bypass. The deployed app is the practical end-to-end test target for the temporary frontend.

## Production release

Authenticate Wrangler without placing an API token in the repository:

```sh
npx wrangler login
npx wrangler whoami
```

Then apply schema before code:

```sh
npx wrangler d1 migrations list recipe-app --remote
npx wrangler d1 migrations apply recipe-app --remote
npm run build
npx wrangler deploy
```

Never edit a migration already applied remotely; add the next numbered migration. After deployment, verify while signed out that `/` and `/api/session` redirect to Access, then sign in with the approved email and exercise create, edit, favorite, conflict-sensitive delete, and the change cursor.

Logs can be observed with:

```sh
npx wrangler tail recipe-app-api
```

Worker logs include request ID, method, route, status, and duration, but never JWTs, emails, request bodies, or recipe content.

## Future secrets

If a future integration needs a secret, use `npx wrangler secret put NAME`. Never place secret values in `wrangler.jsonc`, frontend variables, `.env`, or Git.
