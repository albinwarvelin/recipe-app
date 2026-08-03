# Backend implementation notes

All `/api/*` routes require a verified Cloudflare Access JWT and approved owner email.

## Routes

- `GET /api/session`
- `GET /api/health`
- `GET /api/recipes`
- `GET /api/recipes/:id`
- `POST /api/recipes`
- `PUT /api/recipes/:id` — full replacement
- `PATCH /api/recipes/:id` — partial replacement
- `DELETE /api/recipes/:id` — soft deletion
- `GET /api/tags`
- `POST /api/tags`
- `GET /api/sync/changes?cursor=0&limit=100`
- `POST /api/sync`

Recipe responses contain ordered `ingredients`, ordered `instructions`, and `tags`. A supplied child/tag array replaces that collection. Tags are unique case-insensitively while retaining the first stored display casing.

## Write contract

Every write requires:

- `Content-Type: application/json`
- `X-Requested-With: RecipeApp`
- `Idempotency-Key` containing a UUID
- a same-origin or configured `Origin`

Update, replacement, and delete bodies require `base_version`. A stale version returns `409 VERSION_CONFLICT` with `error.details.current`, and nothing is overwritten. DELETE uses a JSON body: `{ "base_version": 3 }`.

Processed operations store method, path, a canonical SHA-256 request fingerprint, response status, and response JSON. Repeating the same operation returns the stored success with `Idempotency-Replayed: true`; reusing its key for a different request returns `409 IDEMPOTENCY_KEY_REUSE`. The domain write, change event, and processed-operation record are committed in one D1 batch.

## Sync contract

`GET /api/sync/changes` returns integer-sequenced changes and `next_cursor`. Multiple events for one recipe within a page collapse to the newest state. Deleted records return a tombstone with `recipe: null`.

`POST /api/sync` accepts up to 50 ordered operations:

- create: `{ operation_id, type: "create", payload }`
- update: `{ operation_id, type: "update", entity_id, payload: { base_version, ...changes } }`
- delete: `{ operation_id, type: "delete", entity_id, base_version }`

Operations execute sequentially and each result includes its own status/body. Each `operation_id` is the durable idempotency identity. The request also requires an outer idempotency header as a defense-in-depth write contract marker.

## Deliberately excluded for now

URL scraping, JSON import/export, image/R2 handling, and the browser’s persistent Dexie outbox are not part of this backend increment.
