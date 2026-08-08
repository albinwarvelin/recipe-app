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
- `PUT /api/images/:id` — validated normalized WebP upload
- `GET /api/images/:id` — authenticated private image stream
- `DELETE /api/images/:id` — removes an unreferenced image

Recipe responses contain ordered ingredients, ordered instructions, tags, and an optional `image_key`. A supplied child/tag array replaces that collection. Tags are unique case-insensitively while retaining the first stored display casing.

## Write contract

Every JSON write requires `Content-Type: application/json`, `X-Requested-With: RecipeApp`, an `Idempotency-Key` UUID, and a same-origin or configured `Origin`. Image writes use their documented WebP content type instead of JSON.

Update, replacement, and delete bodies require `base_version`. A stale version returns `409 VERSION_CONFLICT` with `error.details.current`, and nothing is overwritten. DELETE uses a JSON body: `{ "base_version": 3 }`.

Processed operations store method, path, a canonical SHA-256 request fingerprint, response status, and response JSON. Repeating the same operation returns the stored success with `Idempotency-Replayed: true`; reusing its key for a different request returns `409 IDEMPOTENCY_KEY_REUSE`. Domain writes, change events, and processed-operation records are committed in one D1 batch where possible.

## Sync contract

`GET /api/sync/changes` returns integer-sequenced changes, `next_cursor`, and `has_more`. Multiple events for one recipe within a page collapse to the newest state. Deleted records return a tombstone with `recipe: null`.

`POST /api/sync` accepts up to 50 ordered operations:

- create: `{ operation_id, type: "create", payload }`
- update: `{ operation_id, type: "update", entity_id, payload: { base_version, ...changes } }`
- delete: `{ operation_id, type: "delete", entity_id, base_version }`

Operations execute sequentially and each result includes its own status/body. Each `operation_id` is the durable idempotency identity. The request also requires an outer idempotency header as a defense-in-depth marker.

## Images

`PUT /api/images/:id` accepts at most 6 MB with `Content-Type: image/webp`, `X-Image-Width`, and `X-Image-Height`. The browser converts JPEG, PNG, WebP, HEIC, or HEIF input into a normalized WebP up to 2560 px on the long edge and keeps a 720 px thumbnail in IndexedDB for offline cards. The Worker verifies the RIFF/WebP signature and dimensions from the bytes, generates the R2 object path from the UUID, records a SHA-256 checksum, and writes metadata to D1. Raw filenames, original uploads, and image metadata never reach R2.

The R2 bucket is private and EU-jurisdiction restricted. Reads stream through the authenticated Worker with private caching, ETag, `nosniff`, and same-origin protections. An image cannot be deleted while an active recipe references it.

## Deliberately excluded for now

URL scraping and JSON import/export remain deliberately excluded.
