import { listTags, type Tag } from '../data/recipes';
import { findProcessedOperation, processedOperationStatement, requestFingerprint } from '../idempotency';
import { error, json, MAX_TAG_JSON_BYTES, readJson } from '../http';
import { tagCreateSchema } from '../validation/recipes';
import { normalizeDisplayName, normalizeIdentityValue, normalizeSearchValue } from '../normalization';

export async function tagRoute(request: Request, env: Env, id: string): Promise<Response> {
  if (request.method === 'GET') return json({ tags: await listTags(env.DB) }, 200, id);
  if (request.method !== 'POST') return error('METHOD_NOT_ALLOWED', 'Method is not supported for this route.', 405, id);
  const operationId = request.headers.get('Idempotency-Key');
  if (!operationId) return error('IDEMPOTENCY_KEY_REQUIRED', 'A stable UUID Idempotency-Key is required.', 400, id);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId)) {
    return error('INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must be a UUID.', 422, id);
  }
  const body = await readJson(request, id, MAX_TAG_JSON_BYTES);
  if (body instanceof Response) return body;
  const parsed = tagCreateSchema.safeParse(body);
  if (!parsed.success) return error('VALIDATION_ERROR', 'The tag could not be accepted.', 422, id, parsed.error.flatten());
  const path = '/api/tags';
  const fingerprint = await requestFingerprint('POST', path, body);
  const processed = await findProcessedOperation(env.DB, operationId);
  if (processed) {
    if (processed.request_hash !== fingerprint || processed.method !== 'POST' || processed.path !== path) {
      return error('IDEMPOTENCY_KEY_REUSE', 'That Idempotency-Key was already used for a different request.', 409, id);
    }
    const response = json(JSON.parse(processed.response_json) as unknown, processed.response_status, id);
    response.headers.set('Idempotency-Replayed', 'true');
    return response;
  }
  const displayName = normalizeDisplayName(parsed.data.name);
  const normalizedName = normalizeIdentityValue(displayName);
  const legacyNormalizedName = normalizeSearchValue(displayName);
  const existing = await env.DB.prepare(
    'SELECT id, name, normalized_name FROM tags WHERE normalized_name = ?1 OR normalized_name = ?2 ORDER BY CASE WHEN normalized_name = ?1 THEN 0 ELSE 1 END LIMIT 1'
  ).bind(normalizedName, legacyNormalizedName).first<Tag & { normalized_name: string }>();
  const tag = existing ?? { id: crypto.randomUUID(), name: displayName };
  const storedNormalizedName = existing?.normalized_name ?? normalizedName;
  const status = existing ? 200 : 201;
  const responseBody = { tag };
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO tags (id, name, normalized_name, created_at) VALUES (?1, ?2, ?3, ?4)').bind(tag.id, tag.name, storedNormalizedName, now),
    processedOperationStatement(env.DB, operationId, 'POST', path, fingerprint, status, responseBody, now),
  ]);
  return json(responseBody, status, id);
}
