import { createRecipe, deleteRecipe, recipeChanges, updateRecipe } from '../data/recipes';
import { imageReferenceExists } from '../data/images';
import { error, json, readJson } from '../http';
import { changesQuerySchema, syncRequestSchema } from '../validation/recipes';
import { mutationResponse } from './recipes';

export async function syncRoute(request: Request, env: Env, id: string): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/sync/changes') {
    if (request.method !== 'GET') return error('METHOD_NOT_ALLOWED', 'Method is not supported for this route.', 405, id);
    const parsed = changesQuerySchema.safeParse({ cursor: url.searchParams.get('cursor') ?? undefined, limit: url.searchParams.get('limit') ?? undefined });
    if (!parsed.success) return error('VALIDATION_ERROR', 'The change cursor is invalid.', 422, id, parsed.error.flatten());
    return json(await recipeChanges(env.DB, parsed.data.cursor, parsed.data.limit), 200, id);
  }
  if (url.pathname !== '/api/sync') return error('NOT_FOUND', 'Route was not found.', 404, id);
  if (request.method !== 'POST') return error('METHOD_NOT_ALLOWED', 'Method is not supported for this route.', 405, id);
  const outerOperationId = request.headers.get('Idempotency-Key');
  if (!outerOperationId) return error('IDEMPOTENCY_KEY_REQUIRED', 'An Idempotency-Key is required for the sync request.', 400, id);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(outerOperationId)) {
    return error('INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must be a UUID.', 422, id);
  }
  const body = await readJson(request, id);
  if (body instanceof Response) return body;
  const parsed = syncRequestSchema.safeParse(body);
  if (!parsed.success) return error('VALIDATION_ERROR', 'The sync operations could not be accepted.', 422, id, parsed.error.flatten());

  const results: unknown[] = [];
  for (const operation of parsed.data.operations) {
    const entityId = operation.type === 'create' ? operation.payload.id ?? 'new' : operation.entity_id;
    const context = {
      operationId: operation.operation_id,
      method: `SYNC:${operation.type.toUpperCase()}`,
      path: `/api/sync/recipes/${entityId}`,
      body: operation,
    };
    const referencedImage = operation.type === 'delete' ? undefined : operation.payload.image_key;
    if (!await imageReferenceExists(env.DB, referencedImage)) {
      results.push({ operation_id: operation.operation_id, status: 422, body: { error: { code: 'IMAGE_NOT_FOUND', message: 'The selected cover image is unavailable.', requestId: id } } });
      continue;
    }
    const result = operation.type === 'create'
      ? await createRecipe(env.DB, operation.payload, context)
      : operation.type === 'update'
        ? await updateRecipe(env.DB, operation.entity_id, operation.payload, context)
        : await deleteRecipe(env.DB, operation.entity_id, operation.base_version, context);
    const response = mutationResponse(result, id);
    results.push({ operation_id: operation.operation_id, status: response.status, body: await response.json() });
  }
  return json({ results }, 200, id);
}
