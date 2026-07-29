import type { Env } from '../types';
import { error, json, readJson } from '../http';
import { recipeInputSchema, recipePatchSchema, type RecipeInput, type RecipePatch } from '../validation/recipes';

type RecipeRow = Record<string, unknown>;

function recipeIdFromPath(pathname: string): string | undefined {
  const match = pathname.match(/^\/api\/recipes\/([^/]+)$/);
  return match?.[1];
}

function clientRecipe(input: RecipeInput, now: string) {
  return {
    id: input.id ?? crypto.randomUUID(), title: input.title, description: input.description,
    servings: input.servings ?? null, prep_minutes: input.prep_minutes ?? null, cook_minutes: input.cook_minutes ?? null,
    source_type: input.source_type, source_name: input.source_name ?? null, source_url: input.source_url ?? null,
    image_key: input.image_key ?? null, notes: input.notes, favorite: input.favorite ? 1 : 0,
    version: 1, created_at: now, updated_at: now, deleted_at: null,
  };
}

export async function recipeRoute(request: Request, env: Env, id: string): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  const recipeId = recipeIdFromPath(pathname);
  if (pathname !== '/api/recipes' && !recipeId) return error('NOT_FOUND', 'Route was not found.', 404, id);
  if (request.method === 'GET') {
    if (recipeId) {
      const row = await env.DB.prepare('SELECT * FROM recipes WHERE id = ?1 AND deleted_at IS NULL').bind(recipeId).first<RecipeRow>();
      return row ? json({ recipe: row }, 200, id) : error('NOT_FOUND', 'Recipe was not found.', 404, id);
    }
    const result = await env.DB.prepare('SELECT * FROM recipes WHERE deleted_at IS NULL ORDER BY updated_at DESC').all<RecipeRow>();
    return json({ recipes: result.results }, 200, id);
  }

  if (request.method === 'POST' && !recipeId) {
    const body = await readJson(request, id);
    if (body instanceof Response) return body;
    const parsed = recipeInputSchema.safeParse(body);
    if (!parsed.success) return error('VALIDATION_ERROR', 'The recipe could not be accepted.', 422, id);
    const recipe = clientRecipe(parsed.data, new Date().toISOString());
    const operationId = request.headers.get('Idempotency-Key');
    if (!operationId) return error('IDEMPOTENCY_KEY_REQUIRED', 'A stable Idempotency-Key is required.', 400, id);
    const existing = await env.DB.prepare('SELECT response_json FROM processed_operations WHERE operation_id = ?1').bind(operationId).first<{ response_json: string }>();
    if (existing) return new Response(existing.response_json, { status: 200, headers: { 'Content-Type': 'application/json', 'X-Request-ID': id } });
    const responseBody = JSON.stringify({ recipe });
    await env.DB.batch([
      env.DB.prepare('INSERT INTO recipes (id, title, description, servings, prep_minutes, cook_minutes, source_type, source_name, source_url, image_key, notes, favorite, version, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(recipe.id, recipe.title, recipe.description, recipe.servings, recipe.prep_minutes, recipe.cook_minutes, recipe.source_type, recipe.source_name, recipe.source_url, recipe.image_key, recipe.notes, recipe.favorite, recipe.version, recipe.created_at, recipe.updated_at, recipe.deleted_at),
      env.DB.prepare('INSERT INTO processed_operations (operation_id, processed_at, response_json) VALUES (?, ?, ?)').bind(operationId, recipe.updated_at, responseBody),
    ]);
    return json({ recipe }, 201, id);
  }

  if ((request.method === 'PATCH' || request.method === 'PUT') && recipeId) {
    const body = await readJson(request, id);
    if (body instanceof Response) return body;
    const parsed = recipePatchSchema.safeParse(body);
    if (!parsed.success || Object.keys(parsed.data).length === 0) return error('VALIDATION_ERROR', 'The recipe update could not be accepted.', 422, id);
    const existing = await env.DB.prepare('SELECT * FROM recipes WHERE id = ?1 AND deleted_at IS NULL').bind(recipeId).first<RecipeRow>();
    if (!existing) return error('NOT_FOUND', 'Recipe was not found.', 404, id);
    const patch = parsed.data as RecipePatch;
    const now = new Date().toISOString();
    const columns: string[] = [];
    const values: unknown[] = [];
    const fields: Record<keyof RecipePatch, string> = { title: 'title', description: 'description', servings: 'servings', prep_minutes: 'prep_minutes', cook_minutes: 'cook_minutes', source_type: 'source_type', source_name: 'source_name', source_url: 'source_url', image_key: 'image_key', notes: 'notes', favorite: 'favorite' };
    for (const key of Object.keys(patch) as Array<keyof RecipePatch>) { columns.push(`${fields[key]} = ?`); values.push(key === 'favorite' ? (patch[key] ? 1 : 0) : patch[key] ?? null); }
    columns.push('version = version + 1', 'updated_at = ?'); values.push(now, recipeId);
    await env.DB.prepare(`UPDATE recipes SET ${columns.join(', ')} WHERE id = ?`).bind(...values).run();
    const updated = await env.DB.prepare('SELECT * FROM recipes WHERE id = ?1').bind(recipeId).first<RecipeRow>();
    return json({ recipe: updated }, 200, id);
  }

  if (request.method === 'DELETE' && recipeId) {
    const now = new Date().toISOString();
    const result = await env.DB.prepare('UPDATE recipes SET deleted_at = ?1, version = version + 1, updated_at = ?2 WHERE id = ?3 AND deleted_at IS NULL').bind(now, now, recipeId).run();
    return result.meta.changes ? json({ deleted: true }, 200, id) : error('NOT_FOUND', 'Recipe was not found.', 404, id);
  }
  return error('METHOD_NOT_ALLOWED', 'Method is not supported for this route.', 405, id);
}
