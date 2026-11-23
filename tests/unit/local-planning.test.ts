import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearLocalData, db } from '../../src/data/db';
import { addManualShoppingItem, addMealPlanEntry, setShoppingCheckState, updateMealPlanEntry, repairMealPlanSyncDate, removeMealPlanSyncProblem } from '../../src/data/local-planning';
import { dateKeySchema, planningSyncRequestSchema } from '../../shared/planning';

async function rejectedDate() {
  const entry = await addMealPlanEntry(crypto.randomUUID(), '2026-10-21', 4);
  const queued = (await db.planningOutbox.toArray())[0];
  await db.mealPlanEntries.update(entry.id, { planned_date: '', sync_status: 'failed' });
  await db.planningOutbox.update(queued.sequence!, { payload: { ...queued.payload, planned_date: '' }, status: 'failed', failure_kind: 'permanent', last_error_code: 'VALIDATION_ERROR', last_error_status: 422, attempt_count: 3 });
  return { entry, queued };
}

describe('local-first planning repository', () => {
  beforeEach(async () => clearLocalData());

  it('stores a planned recipe and its outbox operation atomically', async () => {
    const recipeId = crypto.randomUUID();
    const entry = await addMealPlanEntry(recipeId, '2026-08-31', 4);
    expect(await db.mealPlanEntries.get(entry.id)).toMatchObject({ recipe_id: recipeId, servings: 4, multiplier: 1, sync_status: 'pending' });
    expect(await db.planningOutbox.toArray()).toMatchObject([{ entity_id: entry.id, type: 'meal-plan-put', status: 'pending', payload: { servings: 4, multiplier: 1 } }]);
  });

  it('collapses repeated unsent planning edits', async () => {
    const entry = await addMealPlanEntry(crypto.randomUUID(), '2026-08-31', null);
    await updateMealPlanEntry(entry, { multiplier: 2 });
    const queued = await db.planningOutbox.toArray();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ local_version: 2, payload: { multiplier: 2, servings: null } });
  });

  it('stores discreet manual items and deterministic generated check state', async () => {
    const manual = await addManualShoppingItem('2026-08-31', 'Diskmedel', null, null);
    const checked = await setShoppingCheckState('2026-08-31', 'catalog:tomat|mass', 'source-v1', true);
    expect(manual).toMatchObject({ name: 'Diskmedel', checked: false });
    expect(checked.id).toBe('2026-08-31|catalog:tomat|mass');
    expect(await db.planningOutbox.count()).toBe(2);
  });

  it('rejects empty and impossible dates before changing local data or the queue', async () => {
    await expect(addMealPlanEntry(crypto.randomUUID(), '', 4)).rejects.toThrow('giltigt datum');
    expect(await db.mealPlanEntries.count()).toBe(0);
    const entry = await addMealPlanEntry(crypto.randomUUID(), '2026-10-21', 4);
    await expect(updateMealPlanEntry(entry, { planned_date: '' })).rejects.toThrow('giltigt datum');
    await expect(updateMealPlanEntry(entry, { planned_date: '2026-02-30' })).rejects.toThrow('giltigt datum');
    expect(await db.mealPlanEntries.get(entry.id)).toMatchObject({ planned_date: '2026-10-21' });
    expect((await db.planningOutbox.toArray())[0].payload).toMatchObject({ planned_date: '2026-10-21' });
  });

  it('repairs the selected hidden plan and replaces its rejected request while preserving other changes', async () => {
    const { entry, queued } = await rejectedDate();
    const other = await addManualShoppingItem('2026-10-19', 'Kaffe', '1', 'st');
    const otherOperation = (await db.planningOutbox.where('entity_id').equals(other.id).first())!;
    await repairMealPlanSyncDate(queued.operation_id, '2026-10-24');
    expect(await db.mealPlanEntries.get(entry.id)).toMatchObject({ planned_date: '2026-10-24', servings: 4, sync_status: 'pending' });
    expect(await db.planningOutbox.where('operation_id').equals(queued.operation_id).count()).toBe(0);
    const repaired = (await db.planningOutbox.where('entity_id').equals(entry.id).first())!;
    expect(repaired.operation_id).not.toBe(queued.operation_id);
    expect(planningSyncRequestSchema.safeParse({ operations: [{ operation_id: repaired.operation_id, type: repaired.type, payload: repaired.payload }] }).success).toBe(true);
    expect(await db.planningOutbox.get(otherOperation.sequence!)).toEqual(otherOperation);
  });

  it('queues a valid deletion for the selected invalid plan instead of clearing device data', async () => {
    const { entry, queued } = await rejectedDate();
    await removeMealPlanSyncProblem(queued.operation_id);
    const removed = (await db.mealPlanEntries.get(entry.id))!;
    expect(removed.deleted_at).not.toBeNull();
    expect(dateKeySchema.safeParse(removed.planned_date).success).toBe(true);
    expect(removed.recipe_id).toBe(entry.recipe_id);
    const [deletion] = await db.planningOutbox.toArray();
    expect(deletion.operation_id).not.toBe(queued.operation_id);
    expect(planningSyncRequestSchema.safeParse({ operations: [{ operation_id: deletion.operation_id, type: deletion.type, payload: deletion.payload }] }).success).toBe(true);
  });

  it('leaves the failed plan intact if its proposed repair is still invalid', async () => {
    const { entry, queued } = await rejectedDate();
    await expect(repairMealPlanSyncDate(queued.operation_id, '2026-02-30')).rejects.toThrow('giltigt datum');
    expect(await db.mealPlanEntries.get(entry.id)).toMatchObject({ planned_date: '', sync_status: 'failed' });
    expect(await db.planningOutbox.where('operation_id').equals(queued.operation_id).count()).toBe(1);
  });

  it('keeps an uncertain planning request immutable when a later edit is queued', async () => {
    const entry = await addMealPlanEntry(crypto.randomUUID(), '2026-10-21', 4);
    const [queued] = await db.planningOutbox.toArray();
    await db.planningOutbox.update(queued.sequence!, { status: 'failed', failure_kind: 'transient', attempt_count: 1 });
    await updateMealPlanEntry(entry, { planned_date: '2026-10-22' });
    const operations = await db.planningOutbox.toArray();
    expect(operations).toHaveLength(2);
    expect(operations[0]).toMatchObject({ operation_id: queued.operation_id, payload: { planned_date: '2026-10-21' } });
    expect(operations[1]).toMatchObject({ payload: { planned_date: '2026-10-22' } });
  });
});

