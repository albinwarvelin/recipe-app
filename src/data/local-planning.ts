import type { ManualShoppingItemInput, MealPlanInput, PlanningOperation, ShoppingCheckStateInput } from '../../shared/planning';
import { dateKeySchema, mealPlanInputSchema } from '../../shared/planning';
import { db, type LocalManualShoppingItem, type LocalMealPlanEntry, type LocalShoppingCheckState, type PlanningOutboxOperation } from './db';
import { normalizeDisplayName, normalizeUnit } from './normalize';

function timestamp(): string { return new Date().toISOString(); }

function operation(type: PlanningOperation['type'], entityId: string, payload: PlanningOperation['payload'], localVersion: number, createdAt: string): PlanningOutboxOperation {
  return {
    operation_id: crypto.randomUUID(), entity_id: entityId, type, payload,
    created_at: createdAt, last_attempt_at: null, attempt_count: 0, local_version: localVersion,
    status: 'pending', last_error_code: null, failure_kind: null, next_attempt_at: null,
  };
}

async function queuePlanningOperation(entry: PlanningOutboxOperation): Promise<void> {
  const pending = (await db.planningOutbox.where('entity_id').equals(entry.entity_id).toArray())
    .reverse().find((candidate) => candidate.status === 'pending' || candidate.status === 'failed');
  if (pending?.sequence !== undefined && (!pending.attempt_count || pending.failure_kind === 'permanent')) {
    await db.planningOutbox.put({ ...entry, sequence: pending.sequence, operation_id: pending.attempt_count ? entry.operation_id : pending.operation_id, created_at: pending.created_at });
  } else {
    await db.planningOutbox.add(entry);
  }
}

function mealInput(entry: LocalMealPlanEntry): MealPlanInput {
  const { version: _version, local_version: _localVersion, sync_status: _syncStatus, ...input } = entry;
  return input;
}

function manualInput(item: LocalManualShoppingItem): ManualShoppingItemInput {
  const { version: _version, local_version: _localVersion, sync_status: _syncStatus, ...input } = item;
  return input;
}

function checkInput(state: LocalShoppingCheckState): ShoppingCheckStateInput {
  const { version: _version, local_version: _localVersion, sync_status: _syncStatus, ...input } = state;
  return input;
}

export async function addMealPlanEntry(recipeId: string, plannedDate: string, servings: number | null): Promise<LocalMealPlanEntry> {
  requirePlanDate(plannedDate);
  const now = timestamp();
  const position = await db.mealPlanEntries.where('planned_date').equals(plannedDate).count();
  const entry: LocalMealPlanEntry = {
    id: crypto.randomUUID(), recipe_id: recipeId, planned_date: plannedDate,
    servings, multiplier: 1, position, version: 0, local_version: 1,
    sync_status: 'pending', created_at: now, updated_at: now, deleted_at: null,
  };
  await db.transaction('rw', db.mealPlanEntries, db.planningOutbox, async () => {
    await db.mealPlanEntries.put(entry);
    await queuePlanningOperation(operation('meal-plan-put', entry.id, mealInput(entry), entry.local_version, now));
  });
  return entry;
}

export async function updateMealPlanEntry(entry: LocalMealPlanEntry, patch: Partial<Pick<MealPlanInput, 'planned_date' | 'servings' | 'multiplier' | 'position'>>): Promise<LocalMealPlanEntry> {
  requirePlanDate(patch.planned_date ?? entry.planned_date);
  const now = timestamp();
  const updated: LocalMealPlanEntry = { ...entry, ...patch, local_version: entry.local_version + 1, sync_status: 'pending', updated_at: now };
  await db.transaction('rw', db.mealPlanEntries, db.planningOutbox, async () => {
    await db.mealPlanEntries.put(updated);
    await queuePlanningOperation(operation('meal-plan-put', updated.id, mealInput(updated), updated.local_version, now));
  });
  return updated;
}

function requirePlanDate(value: string): void {
  if (!dateKeySchema.safeParse(value).success) throw new Error('Välj ett giltigt datum för den planerade måltiden.');
}

async function recoverMealPlan(operationId: string, plannedDate: string | null): Promise<void> {
  if (plannedDate !== null) requirePlanDate(plannedDate);
  await db.transaction('rw', db.mealPlanEntries, db.planningOutbox, async () => {
    const failed = await db.planningOutbox.where('operation_id').equals(operationId).first();
    if (!failed || failed.type !== 'meal-plan-put' || failed.status !== 'failed' || failed.failure_kind !== 'permanent') {
      throw new Error('Ändringen har redan behandlats. Läs in synkstatus igen.');
    }
    const local = await db.mealPlanEntries.get(failed.entity_id);
    const current: LocalMealPlanEntry = local ?? {
      ...failed.payload as MealPlanInput, version: 0, local_version: failed.local_version, sync_status: 'failed',
    };
    const now = timestamp();
    // A tombstone needs a valid date for the API, but is never displayed as
    // a planned meal. Do not invent a replacement date for a live entry.
    const deletionDate = dateKeySchema.safeParse(current.planned_date).success ? current.planned_date : current.created_at.slice(0, 10);
    const updated: LocalMealPlanEntry = {
      ...current, planned_date: plannedDate ?? deletionDate,
      deleted_at: plannedDate === null ? now : current.deleted_at,
      updated_at: now, local_version: current.local_version + 1, sync_status: 'pending',
    };
    if (!mealPlanInputSchema.safeParse(mealInput(updated)).success) throw new Error('Planeringsändringen innehåller fler ogiltiga fält och kunde inte rättas.');
    // Replace only the selected rejected request. Other recipes and queued
    // changes remain intact; the correction gets a fresh idempotency key.
    await db.planningOutbox.delete(failed.sequence!);
    await db.mealPlanEntries.put(updated);
    await queuePlanningOperation(operation('meal-plan-put', updated.id, mealInput(updated), updated.local_version, now));
  });
}

export function repairMealPlanSyncDate(operationId: string, plannedDate: string): Promise<void> {
  return recoverMealPlan(operationId, plannedDate);
}

export function removeMealPlanSyncProblem(operationId: string): Promise<void> {
  return recoverMealPlan(operationId, null);
}

export async function removeMealPlanEntry(entry: LocalMealPlanEntry): Promise<void> {
  const now = timestamp();
  const removed: LocalMealPlanEntry = { ...entry, deleted_at: now, updated_at: now, local_version: entry.local_version + 1, sync_status: 'pending' };
  await db.transaction('rw', db.mealPlanEntries, db.planningOutbox, async () => {
    await db.mealPlanEntries.put(removed);
    await queuePlanningOperation(operation('meal-plan-put', removed.id, mealInput(removed), removed.local_version, now));
  });
}

export async function addManualShoppingItem(weekStart: string, name: string, amount: string | null, unit: string | null): Promise<LocalManualShoppingItem> {
  const now = timestamp();
  const item: LocalManualShoppingItem = {
    id: crypto.randomUUID(), week_start: weekStart, name: normalizeDisplayName(name),
    amount: amount?.trim() || null, unit: normalizeUnit(unit), checked: false,
    version: 0, local_version: 1, sync_status: 'pending', created_at: now, updated_at: now, deleted_at: null,
  };
  await db.transaction('rw', db.manualShoppingItems, db.planningOutbox, async () => {
    await db.manualShoppingItems.put(item);
    await queuePlanningOperation(operation('manual-item-put', item.id, manualInput(item), item.local_version, now));
  });
  return item;
}

export async function updateManualShoppingItem(item: LocalManualShoppingItem, patch: Partial<Pick<ManualShoppingItemInput, 'name' | 'amount' | 'unit' | 'checked'>>): Promise<LocalManualShoppingItem> {
  const now = timestamp();
  const updated: LocalManualShoppingItem = {
    ...item, ...patch,
    ...(patch.name === undefined ? {} : { name: normalizeDisplayName(patch.name) }),
    ...(patch.amount === undefined ? {} : { amount: patch.amount?.trim() || null }),
    ...(patch.unit === undefined ? {} : { unit: normalizeUnit(patch.unit) }),
    local_version: item.local_version + 1, sync_status: 'pending', updated_at: now,
  };
  await db.transaction('rw', db.manualShoppingItems, db.planningOutbox, async () => {
    await db.manualShoppingItems.put(updated);
    await queuePlanningOperation(operation('manual-item-put', updated.id, manualInput(updated), updated.local_version, now));
  });
  return updated;
}

export async function removeManualShoppingItem(item: LocalManualShoppingItem): Promise<void> {
  const now = timestamp();
  const removed: LocalManualShoppingItem = { ...item, deleted_at: now, updated_at: now, local_version: item.local_version + 1, sync_status: 'pending' };
  await db.transaction('rw', db.manualShoppingItems, db.planningOutbox, async () => {
    await db.manualShoppingItems.put(removed);
    await queuePlanningOperation(operation('manual-item-put', removed.id, manualInput(removed), removed.local_version, now));
  });
}

export async function setShoppingCheckState(weekStart: string, itemKey: string, sourceSignature: string, checked: boolean): Promise<LocalShoppingCheckState> {
  const id = `${weekStart}|${itemKey}`;
  const existing = await db.shoppingCheckStates.get(id);
  const now = timestamp();
  const state: LocalShoppingCheckState = {
    id, week_start: weekStart, item_key: itemKey, source_signature: sourceSignature, checked,
    version: existing?.version ?? 0, local_version: (existing?.local_version ?? 0) + 1,
    sync_status: 'pending', created_at: existing?.created_at ?? now, updated_at: now, deleted_at: null,
  };
  await db.transaction('rw', db.shoppingCheckStates, db.planningOutbox, async () => {
    await db.shoppingCheckStates.put(state);
    await queuePlanningOperation(operation('check-state-put', state.id, checkInput(state), state.local_version, now));
  });
  return state;
}

