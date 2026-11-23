import type {
  ManualShoppingItem,
  ManualShoppingItemInput,
  MealPlanEntry,
  MealPlanInput,
  PlanningChangePage,
  PlanningEntity,
  PlanningEntityType,
  PlanningOperation,
  ShoppingCheckState,
  ShoppingCheckStateInput,
} from '../../shared/planning';
import { findProcessedOperation, processedOperationStatement, requestFingerprint } from '../idempotency';

export type PlanningMutationResult =
  | { kind: 'success'; status: number; body: { entity_type: PlanningEntityType; entity: PlanningEntity }; replayed: boolean }
  | { kind: 'invalid_reference' }
  | { kind: 'idempotency_reuse' };

interface MutationContext {
  operationId: string;
  method: string;
  path: string;
  body: unknown;
}

interface ChangeRow {
  sequence: number;
  entity_type: PlanningEntityType;
  entity_id: string;
  entity_version: number;
  changed_at: string;
  deleted: number;
}

function entityType(operation: PlanningOperation): PlanningEntityType {
  if (operation.type === 'meal-plan-put') return 'meal-plan';
  if (operation.type === 'manual-item-put') return 'manual-item';
  return 'check-state';
}

function booleanRow<T extends { checked: number }>(row: T): Omit<T, 'checked'> & { checked: boolean } {
  return { ...row, checked: row.checked === 1 };
}

export async function getPlanningEntity(db: D1Database, type: PlanningEntityType, id: string): Promise<PlanningEntity | null> {
  if (type === 'meal-plan') {
    return await db.prepare('SELECT * FROM meal_plan_entries WHERE id = ?1').bind(id).first<MealPlanEntry>();
  }
  if (type === 'manual-item') {
    const row = await db.prepare('SELECT * FROM manual_shopping_items WHERE id = ?1').bind(id).first<Omit<ManualShoppingItem, 'checked'> & { checked: number }>();
    return row ? booleanRow(row) : null;
  }
  const row = await db.prepare('SELECT * FROM shopping_check_states WHERE id = ?1').bind(id).first<Omit<ShoppingCheckState, 'checked'> & { checked: number }>();
  return row ? booleanRow(row) : null;
}

async function replayOrReuse(db: D1Database, context: MutationContext, fingerprint: string): Promise<PlanningMutationResult | null> {
  const processed = await findProcessedOperation(db, context.operationId);
  if (!processed) return null;
  if (processed.request_hash !== fingerprint || processed.method !== context.method || processed.path !== context.path) return { kind: 'idempotency_reuse' };
  return { kind: 'success', status: processed.response_status, body: JSON.parse(processed.response_json) as { entity_type: PlanningEntityType; entity: PlanningEntity }, replayed: true };
}

function entityWithVersion(input: PlanningOperation['payload'], version: number): PlanningEntity {
  return { ...input, version } as PlanningEntity;
}

function upsertStatement(db: D1Database, type: PlanningEntityType, entity: PlanningEntity): D1PreparedStatement {
  if (type === 'meal-plan') {
    const entry = entity as MealPlanEntry;
    return db.prepare(
      'INSERT INTO meal_plan_entries (id, recipe_id, planned_date, servings, multiplier, position, version, created_at, updated_at, deleted_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10) ON CONFLICT(id) DO UPDATE SET recipe_id = excluded.recipe_id, planned_date = excluded.planned_date, servings = excluded.servings, multiplier = excluded.multiplier, position = excluded.position, version = excluded.version, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at'
    ).bind(entry.id, entry.recipe_id, entry.planned_date, entry.servings, entry.multiplier, entry.position, entry.version, entry.created_at, entry.updated_at, entry.deleted_at);
  }
  if (type === 'manual-item') {
    const item = entity as ManualShoppingItem;
    return db.prepare(
      'INSERT INTO manual_shopping_items (id, week_start, name, amount, unit, checked, version, created_at, updated_at, deleted_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10) ON CONFLICT(id) DO UPDATE SET week_start = excluded.week_start, name = excluded.name, amount = excluded.amount, unit = excluded.unit, checked = excluded.checked, version = excluded.version, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at'
    ).bind(item.id, item.week_start, item.name, item.amount, item.unit, item.checked ? 1 : 0, item.version, item.created_at, item.updated_at, item.deleted_at);
  }
  const state = entity as ShoppingCheckState;
  return db.prepare(
    'INSERT INTO shopping_check_states (id, week_start, item_key, source_signature, checked, version, created_at, updated_at, deleted_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) ON CONFLICT(id) DO UPDATE SET week_start = excluded.week_start, item_key = excluded.item_key, source_signature = excluded.source_signature, checked = excluded.checked, version = excluded.version, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at'
  ).bind(state.id, state.week_start, state.item_key, state.source_signature, state.checked ? 1 : 0, state.version, state.created_at, state.updated_at, state.deleted_at);
}

export async function putPlanningEntity(db: D1Database, operation: PlanningOperation, context: MutationContext): Promise<PlanningMutationResult> {
  const fingerprint = await requestFingerprint(context.method, context.path, context.body);
  const replay = await replayOrReuse(db, context, fingerprint);
  if (replay) return replay;
  const type = entityType(operation);
  const existing = await getPlanningEntity(db, type, operation.payload.id);
  if (existing && existing.updated_at > operation.payload.updated_at) {
    const body = { entity_type: type, entity: existing };
    await db.batch([processedOperationStatement(db, context.operationId, context.method, context.path, fingerprint, 200, body, new Date().toISOString())]);
    return { kind: 'success', status: 200, body, replayed: false };
  }
  if (type === 'meal-plan' && !operation.payload.deleted_at) {
    const recipeId = (operation.payload as MealPlanInput).recipe_id;
    const recipe = await db.prepare('SELECT id FROM recipes WHERE id = ?1 AND deleted_at IS NULL').bind(recipeId).first<{ id: string }>();
    if (!recipe) return { kind: 'invalid_reference' };
  }
  const entity = entityWithVersion(operation.payload, (existing?.version ?? 0) + 1);
  const body = { entity_type: type, entity };
  const serverNow = new Date().toISOString();
  const statements = [
    upsertStatement(db, type, entity),
    db.prepare('INSERT INTO planning_changes (entity_type, entity_id, entity_version, changed_at, deleted) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(type, entity.id, entity.version, serverNow, entity.deleted_at ? 1 : 0),
    processedOperationStatement(db, context.operationId, context.method, context.path, fingerprint, existing ? 200 : 201, body, serverNow),
  ];
  try {
    await db.batch(statements);
  } catch (cause) {
    const concurrentReplay = await replayOrReuse(db, context, fingerprint);
    if (concurrentReplay) return concurrentReplay;
    throw cause;
  }
  return { kind: 'success', status: existing ? 200 : 201, body, replayed: false };
}

export async function planningChanges(db: D1Database, cursor: number, limit: number): Promise<PlanningChangePage> {
  const result = await db.prepare(
    'SELECT sequence, entity_type, entity_id, entity_version, changed_at, deleted FROM planning_changes WHERE sequence > ?1 ORDER BY sequence LIMIT ?2'
  ).bind(cursor, limit).all<ChangeRow>();
  const latest = new Map<string, ChangeRow>();
  for (const change of result.results) latest.set(`${change.entity_type}:${change.entity_id}`, change);
  const changes = await Promise.all([...latest.values()].map(async (change) => ({
    sequence: change.sequence,
    entity_type: change.entity_type,
    entity_id: change.entity_id,
    version: change.entity_version,
    changed_at: change.changed_at,
    deleted: change.deleted === 1,
    entity: change.deleted === 1 ? null : await getPlanningEntity(db, change.entity_type, change.entity_id),
  })));
  return { changes, next_cursor: result.results.at(-1)?.sequence ?? cursor, has_more: result.results.length === limit };
}

export type { ManualShoppingItemInput, MealPlanInput, ShoppingCheckStateInput };

