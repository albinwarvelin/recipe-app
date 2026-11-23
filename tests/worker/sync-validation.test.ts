import { env } from 'cloudflare:workers';
import { expect, it } from 'vitest';
import { syncRoute } from '../../worker/routes/sync';
import { planningRoute } from '../../worker/routes/planning';
import { createRecipe } from '../../worker/data/recipes';
import { recipeInputSchema } from '../../worker/validation/recipes';

it('returns nested validation paths and constraints with a request ID', async () => {
  const response = await syncRoute(new Request('https://recipes.test/api/sync', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ operations: [{ operation_id: crypto.randomUUID(), type: 'create', payload: { title: 'Soppa', servings: '4', ingredients: [{ name: 'Salt', amount: 2 }] } }] }),
  }), env, 'validation-request');
  expect(response.status).toBe(422);
  const body = await response.json() as { error: { code: string; requestId: string; details: { issues: Array<{ path: Array<string | number>; message: string }> } } };
  expect(body.error).toMatchObject({ code: 'VALIDATION_ERROR', requestId: 'validation-request' });
  expect(body.error.details.issues).toContainEqual({ path: ['operations', 0, 'payload', 'ingredients', 0, 'amount'], message: expect.stringContaining('text') });
  expect(body.error.details.issues).toContainEqual({ path: ['operations', 0, 'payload', 'servings'], message: expect.stringContaining('tal') });
});

it('accepts a targeted deletion for a rejected plan without deleting its recipe', async () => {
  const recipeId = crypto.randomUUID();
  const input = recipeInputSchema.parse({ id: recipeId, title: 'Behåll receptet' });
  await createRecipe(env.DB, input, { operationId: crypto.randomUUID(), method: 'POST', path: '/api/recipes', body: input });
  const now = new Date().toISOString();
  const payload = { id: crypto.randomUUID(), recipe_id: recipeId, planned_date: '', servings: 4, multiplier: 1, position: 0, created_at: now, updated_at: now, deleted_at: null };
  const request = (value: typeof payload | (Omit<typeof payload, 'deleted_at'> & { deleted_at: string })) => new Request('https://recipes.test/api/planning/sync', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ operations: [{ operation_id: crypto.randomUUID(), type: 'meal-plan-put', payload: value }] }),
  });
  const rejected = await planningRoute(request(payload), env, 'invalid-date');
  expect(rejected.status).toBe(422);
  const rejectedBody = await rejected.json() as { error: { details: { issues: unknown[] } } };
  expect(rejectedBody.error.details.issues).toHaveLength(1);
  const removed = await planningRoute(request({ ...payload, planned_date: now.slice(0, 10), deleted_at: now }), env, 'remove-plan');
  expect(removed.status).toBe(200);
  expect(await env.DB.prepare('SELECT deleted_at FROM meal_plan_entries WHERE id = ?1').bind(payload.id).first()).toEqual({ deleted_at: now });
  expect(await env.DB.prepare('SELECT deleted_at FROM recipes WHERE id = ?1').bind(recipeId).first()).toEqual({ deleted_at: null });
});
