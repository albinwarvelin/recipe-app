import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { planningChanges, putPlanningEntity } from '../../worker/data/planning';
import { createRecipe } from '../../worker/data/recipes';
import { recipeInputSchema } from '../../worker/validation/recipes';
import { planningOperationSchema } from '../../shared/planning';

describe('planning persistence', () => {
  it('upserts, replays, and publishes meal-plan changes', async () => {
    const recipeInput = recipeInputSchema.parse({ title: 'Planerad gryta', servings: 4 });
    const createdRecipe = await createRecipe(env.DB, recipeInput, { operationId: crypto.randomUUID(), method: 'POST', path: '/api/recipes', body: recipeInput });
    if (createdRecipe.kind !== 'success') throw new Error('Recipe setup failed');
    const recipe = (createdRecipe.body as { recipe: { id: string } }).recipe;
    const now = '2026-08-31T10:00:00.000Z';
    const operation = planningOperationSchema.parse({
      operation_id: crypto.randomUUID(), type: 'meal-plan-put',
      payload: { id: crypto.randomUUID(), recipe_id: recipe.id, planned_date: '2026-08-31', servings: 6, multiplier: 1, position: 0, created_at: now, updated_at: now, deleted_at: null },
    });
    const context = { operationId: operation.operation_id, method: 'PLANNING:MEAL-PLAN-PUT', path: `/api/planning/${operation.payload.id}`, body: operation };
    const created = await putPlanningEntity(env.DB, operation, context);
    expect(created).toMatchObject({ kind: 'success', status: 201, body: { entity: { servings: 6, version: 1 } }, replayed: false });
    expect(await putPlanningEntity(env.DB, operation, context)).toMatchObject({ kind: 'success', status: 201, replayed: true });
    expect(await planningChanges(env.DB, 0, 100)).toMatchObject({ changes: [{ entity_type: 'meal-plan', entity_id: operation.payload.id, deleted: false, entity: { servings: 6 } }] });
  });

  it('rejects a plan referencing an unavailable recipe', async () => {
    const now = '2026-08-31T10:00:00.000Z';
    const operation = planningOperationSchema.parse({
      operation_id: crypto.randomUUID(), type: 'meal-plan-put',
      payload: { id: crypto.randomUUID(), recipe_id: crypto.randomUUID(), planned_date: '2026-08-31', servings: null, multiplier: 1, position: 0, created_at: now, updated_at: now, deleted_at: null },
    });
    expect(await putPlanningEntity(env.DB, operation, { operationId: operation.operation_id, method: 'PLANNING:MEAL-PLAN-PUT', path: `/api/planning/${operation.payload.id}`, body: operation })).toEqual({ kind: 'invalid_reference' });
  });
});

