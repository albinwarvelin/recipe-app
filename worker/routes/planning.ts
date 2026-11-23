import { planningChanges, putPlanningEntity } from '../data/planning';
import { error, json, MAX_SYNC_JSON_BYTES, readJson } from '../http';
import { changesQuerySchema } from '../validation/recipes';
import { planningSyncRequestSchema } from '../../shared/planning';
import { validationIssues } from '../../shared/validation-issues';

export async function planningRoute(request: Request, env: Env, id: string): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/planning/changes') {
    if (request.method !== 'GET') return error('METHOD_NOT_ALLOWED', 'Method is not supported for this route.', 405, id);
    const parsed = changesQuerySchema.safeParse({ cursor: url.searchParams.get('cursor') ?? undefined, limit: url.searchParams.get('limit') ?? undefined });
    if (!parsed.success) return error('VALIDATION_ERROR', 'The change cursor is invalid.', 422, id, parsed.error.flatten());
    return json(await planningChanges(env.DB, parsed.data.cursor, parsed.data.limit), 200, id);
  }
  if (url.pathname !== '/api/planning/sync') return error('NOT_FOUND', 'Route was not found.', 404, id);
  if (request.method !== 'POST') return error('METHOD_NOT_ALLOWED', 'Method is not supported for this route.', 405, id);
  const outerOperationId = request.headers.get('Idempotency-Key');
  if (!outerOperationId) return error('IDEMPOTENCY_KEY_REQUIRED', 'An Idempotency-Key is required for the sync request.', 400, id);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(outerOperationId)) {
    return error('INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must be a UUID.', 422, id);
  }
  const body = await readJson(request, id, MAX_SYNC_JSON_BYTES);
  if (body instanceof Response) return body;
  const parsed = planningSyncRequestSchema.safeParse(body);
  if (!parsed.success) return error('VALIDATION_ERROR', 'The planning operations could not be accepted.', 422, id, { issues: validationIssues(parsed.error.issues) });

  const results: unknown[] = [];
  for (const operation of parsed.data.operations) {
    const context = {
      operationId: operation.operation_id,
      method: `PLANNING:${operation.type.toUpperCase()}`,
      path: `/api/planning/${operation.payload.id}`,
      body: operation,
    };
    const result = await putPlanningEntity(env.DB, operation, context);
    if (result.kind === 'success') results.push({ operation_id: operation.operation_id, status: result.status, body: result.body });
    else if (result.kind === 'invalid_reference') results.push({ operation_id: operation.operation_id, status: 422, body: { error: { code: 'RECIPE_NOT_FOUND', message: 'The planned recipe is unavailable.', requestId: id } } });
    else results.push({ operation_id: operation.operation_id, status: 409, body: { error: { code: 'IDEMPOTENCY_KEY_REUSE', message: 'The operation ID was already used for another request.', requestId: id } } });
  }
  return json({ results }, 200, id);
}

