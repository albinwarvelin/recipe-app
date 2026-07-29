# Local development and Cloudflare deployment

## The mental model

This repository has two logical applications in one deployable project:

```text
src/ + Vite                       worker/
React UI and PWA shell             API, Access validation, D1 queries
        │                                   │
        └────────── same Worker hostname ───┘
                         │
                    Cloudflare Access
                         │
                     Cloudflare D1
```

The frontend is compiled into `dist/`. The Worker handles `/api/*` and serves the compiled static assets for every other path. This keeps the browser app and server code separate in source and in security responsibilities, while avoiding cross-origin cookie and CORS complexity for the first production deployment.

The frontend must never contain D1 bindings, Access secrets, signing keys, or private recipe data. It calls relative URLs such as `/api/recipes`. The Worker is the only code that can access D1.

Later, the frontend can be moved to Cloudflare Pages or a second Worker without changing the backend design. At that point, set the production frontend origin in `ALLOWED_ORIGINS` and keep the API hostname protected by its own Access application.

## One-time account setup

Install Node.js, then authenticate Wrangler:

```sh
npm install
npx wrangler login
npx wrangler whoami
```

The browser login grants Wrangler access to the selected Cloudflare account. Do not put an API token in the repository.

Create the production D1 database:

```sh
npx wrangler d1 create recipe-app
```

Copy the returned `database_id` into `wrangler.jsonc`. The `DB` binding in that file is what makes the database available to the Worker as `env.DB`.

Apply the versioned schema locally first:

```sh
npx wrangler d1 migrations apply recipe-app --local
```

Apply it to the real Cloudflare database only when ready:

```sh
npx wrangler d1 migrations apply recipe-app --remote
```

Never edit a migration that has already been applied remotely. Add a new numbered migration instead.

## Configure Cloudflare Access

In the Cloudflare dashboard:

1. Open **Zero Trust → Access controls → Applications**.
2. Create a **Self-hosted** application with the public hostname you will use for this app, for example `recipes.example.com`.
3. Add an **Allow** policy with **Include → Email → your exact owner email**.
4. Enable only the identity provider you intend to use. Email OTP is acceptable for a private single-user app; an existing Google/GitHub/Microsoft identity provider is also possible.
5. Copy the application’s **Application Audience (AUD) Tag**.
6. Set `ACCESS_TEAM_DOMAIN` to the full team URL, such as `https://my-team.cloudflareaccess.com`.
7. Set `ACCESS_AUDIENCE` to the AUD tag and `OWNER_EMAIL` to the exact approved email.

Cloudflare Access is the outer gate. The Worker independently verifies the `Cf-Access-Jwt-Assertion` signature through the rotating Access JWKS endpoint, then checks issuer, audience, expiration, not-before, algorithm, subject, and the approved owner email.

For local Worker development, use placeholder values in `.dev.vars` only. A real Access token is normally obtained by visiting the deployed hostname through Access; local requests without a token should remain unauthorized. Do not add a development bypass to production code.

## Local development

Run the browser and Worker in separate terminals:

```sh
npm run dev
npm run worker:dev
```

Vite serves the UI on `http://localhost:5173`. Wrangler serves the Worker, normally on `http://localhost:8787`. For the first same-origin production deployment, the browser should call the deployed Worker URL. During local development, a Vite proxy can be added later so `/api` forwards to Wrangler without changing frontend code.

Use local D1 while developing:

```sh
npx wrangler d1 migrations apply recipe-app --local
npx wrangler dev worker/index.ts
```

Local D1 data is separate from the remote database.

## Deploying the application

Build the React app and deploy the Worker plus `dist/` assets:

```sh
npm run build
npx wrangler deploy
```

The Worker receives `DB` and `ASSETS` bindings from `wrangler.jsonc`. Cloudflare serves the static PWA shell through `ASSETS`; requests beginning with `/api/` stay inside the Worker API router.

After deployment:

```sh
npx wrangler tail recipe-app-api
```

Then open the production hostname in a browser, complete Access login, and verify that `/api/health` succeeds only for the approved owner. Do not log JWTs or recipe bodies.

## Configuration and secrets

The current values are non-secret configuration: hostname, audience, owner email, and allowed origins. They may be stored as Wrangler variables, but production values should be set deliberately per environment. If a future integration needs a secret, use a Worker secret:

```sh
npx wrangler secret put SOME_SECRET
```

Never put that value in `wrangler.jsonc`, frontend code, `.env`, or Git.

## Production shape

The launch sequence is:

1. Vite compiles `src/` to static files in `dist/`.
2. Wrangler uploads the Worker and the `dist/` files.
3. A request reaches the Cloudflare hostname.
4. Access authenticates the browser and adds the application JWT on origin requests.
5. The Worker validates that JWT for every `/api/*` request.
6. Authenticated Worker code validates input and queries D1 with parameterised statements.
7. The PWA caches replaceable app-shell assets; recipe records will later be stored in IndexedDB and D1, never in the public asset bundle.
