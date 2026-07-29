# Backend implementation notes

## Current routes

All routes under `/api/` require a valid Cloudflare Access application JWT. Current routes are:

- `GET /api/health`
- `GET /api/recipes`
- `GET /api/recipes/:id`
- `POST /api/recipes`
- `PATCH /api/recipes/:id`
- `PUT /api/recipes/:id`
- `DELETE /api/recipes/:id`

Writes require `Content-Type: application/json`, an `X-Requested-With: RecipeApp` marker, and a stable `Idempotency-Key` for creates. The marker is a defense-in-depth CSRF check; same-origin requests from the application can send it, while a normal cross-origin HTML form cannot.

## Important next backend work

1. Add base-version checks to PATCH/PUT and return `409 CONFLICT` instead of silently overwriting.
2. Add idempotency records for update and delete operations, not only creates.
3. Add ingredients, instructions, tags, and recipe relationships in migrations and transactions.
4. Add rate limiting at the Cloudflare edge or a durable rate-limit design for import, sync, and export.
5. Add the Dexie schema and transactional outbox before building optimistic recipe editing in the UI.
