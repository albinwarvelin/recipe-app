import { createRecipe, deleteRecipe, getRecipe, listRecipes, updateRecipe, type MutationResult } from '../data/recipes';
import { imageReferenceExists } from '../data/images';
import { error, json, readJson } from '../http';
import { recipeDeleteSchema, recipeInputSchema, recipePatchSchema, recipePutSchema } from '../validation/recipes';

function recipeIdFromPath(pathname: string): string | undefined {
  const match = pathname.match(/^\/api\/recipes\/([^/]+)$/);
  return match?.[1];
}

function operationId(request: Request, id: string): string | Response {
  const value = request.headers.get('Idempotency-Key');
  if (!value) return error('IDEMPOTENCY_KEY_REQUIRED', 'A stable UUID Idempotency-Key is required.', 400, id);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return error('INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must be a UUID.', 422, id);
  }
  return value;
}

export function mutationResponse(result: MutationResult, id: string): Response {
  if (result.kind === 'success') {
    const response = json(result.body, result.status, id);
    if (result.replayed) response.headers.set('Idempotency-Replayed', 'true');
    return response;
  }
  if (result.kind === 'not_found') return error('NOT_FOUND', 'Recipe was not found.', 404, id);
  if (result.kind === 'conflict') return error('VERSION_CONFLICT', 'The recipe changed after this copy was loaded.', 409, id, { current: result.current });
  return error('IDEMPOTENCY_KEY_REUSE', 'That Idempotency-Key was already used for a different request.', 409, id);
}

export async function recipeRoute(request: Request, env: Env, id: string): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  const recipeId = recipeIdFromPath(pathname);
  if (pathname !== '/api/recipes' && !recipeId) return error('NOT_FOUND', 'Route was not found.', 404, id);

  if (request.method === 'GET') {
    if (recipeId) {
      const recipe = await getRecipe(env.DB, recipeId);
      return recipe ? json({ recipe }, 200, id) : error('NOT_FOUND', 'Recipe was not found.', 404, id);
    }
    return json({ recipes: await listRecipes(env.DB) }, 200, id);
  }

  const key = operationId(request, id);
  if (key instanceof Response) return key;
  const body = await readJson(request, id);
  if (body instanceof Response) return body;
  const context = { operationId: key, method: request.method, path: pathname, body };

  if (request.method === 'POST' && !recipeId) {
    const parsed = recipeInputSchema.safeParse(body);
    if (!parsed.success) return error('VALIDATION_ERROR', 'The recipe could not be accepted.', 422, id, parsed.error.flatten());
    if (!await imageReferenceExists(env.DB, parsed.data.image_key)) return error('IMAGE_NOT_FOUND', 'The selected cover image is unavailable.', 422, id);
    return mutationResponse(await createRecipe(env.DB, parsed.data, context), id);
  }

  if (request.method === 'PATCH' && recipeId) {
    const parsed = recipePatchSchema.safeParse(body);
    if (!parsed.success) return error('VALIDATION_ERROR', 'The recipe update could not be accepted.', 422, id, parsed.error.flatten());
    if (!await imageReferenceExists(env.DB, parsed.data.image_key)) return error('IMAGE_NOT_FOUND', 'The selected cover image is unavailable.', 422, id);
    return mutationResponse(await updateRecipe(env.DB, recipeId, parsed.data, context), id);
  }

  if (request.method === 'PUT' && recipeId) {
    const parsed = recipePutSchema.safeParse(body);
    if (!parsed.success) return error('VALIDATION_ERROR', 'The replacement recipe could not be accepted.', 422, id, parsed.error.flatten());
    if (!await imageReferenceExists(env.DB, parsed.data.image_key)) return error('IMAGE_NOT_FOUND', 'The selected cover image is unavailable.', 422, id);
    return mutationResponse(await updateRecipe(env.DB, recipeId, parsed.data, context), id);
  }

  if (request.method === 'DELETE' && recipeId) {
    const parsed = recipeDeleteSchema.safeParse(body);
    if (!parsed.success) return error('VALIDATION_ERROR', 'A valid base_version is required.', 422, id, parsed.error.flatten());
    return mutationResponse(await deleteRecipe(env.DB, recipeId, parsed.data.base_version, context), id);
  }

  return error('METHOD_NOT_ALLOWED', 'Method is not supported for this route.', 405, id);
}
