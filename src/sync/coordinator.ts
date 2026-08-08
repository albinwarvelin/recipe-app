import { ApiError, AuthenticationRequiredError, downloadImage, getChanges, pushOperations, removeImage, uploadImage, type Recipe, type RecipeDraft, type SyncOperation, type SyncResult } from '../api/recipes';
import { db, type LocalRecipe, type OutboxOperation, type RecipeConflict } from '../data/db';
import { sanitizeRecipeDraft } from '../data/local-recipes';
import { thumbnailFromWebp } from '../images/process';

export type SyncPhase = 'idle' | 'syncing' | 'offline' | 'auth-required' | 'error';
export interface SyncSnapshot { phase: SyncPhase; pending: number; lastSync: string | null; message: string | null; }

let snapshot: SyncSnapshot = { phase: navigator.onLine ? 'idle' : 'offline', pending: 0, lastSync: null, message: null };
let activeSync: Promise<void> | null = null;
const listeners = new Set<(next: SyncSnapshot) => void>();

async function pruneFullImageCache(): Promise<void> {
  const cached = (await db.images.toArray())
    .filter((image) => image.remote && image.full_blob)
    .sort((left, right) => right.last_accessed_at.localeCompare(left.last_accessed_at));
  for (const image of cached.slice(20)) await db.images.update(image.id, { full_blob: undefined });
}

function publish(patch: Partial<SyncSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener(snapshot);
}

export function syncSnapshot(): SyncSnapshot { return snapshot; }
export function subscribeSync(listener: (next: SyncSnapshot) => void): () => void {
  listeners.add(listener); listener(snapshot); return () => listeners.delete(listener);
}

async function updatePendingCount(): Promise<void> {
  publish({ pending: await db.outbox.where('status').anyOf('pending', 'syncing', 'failed', 'conflict').count() });
}

function recipeDraft(recipe: LocalRecipe): RecipeDraft {
  const { id: _id, version: _version, local_version: _local, sync_status: _sync, created_at: _created, updated_at: _updated, deleted_at: _deleted, ...draft } = recipe;
  return structuredClone(draft);
}

function syncOperation(entry: OutboxOperation): SyncOperation {
  if (entry.type === 'recipe-create') return { operation_id: entry.operation_id, type: 'create', payload: { ...sanitizeRecipeDraft(entry.payload as RecipeDraft), id: entry.entity_id } };
  if (entry.type === 'recipe-update') return { operation_id: entry.operation_id, type: 'update', entity_id: entry.entity_id, payload: { ...sanitizeRecipeDraft(entry.payload as RecipeDraft), base_version: entry.base_server_version } };
  return { operation_id: entry.operation_id, type: 'delete', entity_id: entry.entity_id, base_version: entry.base_server_version };
}

async function markFailed(entry: OutboxOperation, code: string): Promise<void> {
  if (entry.sequence === undefined) return;
  await db.outbox.update(entry.sequence, { status: 'failed', last_error_code: code });
}

async function unblockDependents(entry: OutboxOperation, serverVersion?: number): Promise<void> {
  const dependents = await db.outbox.where('depends_on').equals(entry.operation_id).toArray();
  for (const dependent of dependents) {
    if (dependent.sequence === undefined) continue;
    const patch: Partial<OutboxOperation> = { depends_on: null };
    if (serverVersion !== undefined && (dependent.type === 'recipe-update' || dependent.type === 'recipe-delete')) {
      patch.base_server_version = serverVersion;
      if (dependent.payload) patch.payload = { ...dependent.payload, base_version: serverVersion };
    }
    await db.outbox.update(dependent.sequence, patch);
  }
}

async function acknowledgeRecipe(entry: OutboxOperation, result: SyncResult): Promise<void> {
  if (entry.sequence === undefined) return;
  const server = result.body.recipe;
  await db.transaction('rw', db.recipes, db.outbox, async () => {
    await db.outbox.delete(entry.sequence!);
    await unblockDependents(entry, server?.version ?? (result.body as { version?: number }).version);
    const current = await db.recipes.get(entry.entity_id);
    if (!current) return;
    const remaining = (await db.outbox.where('entity_id').equals(entry.entity_id).toArray()).some((item) => item.type.startsWith('recipe-'));
    if (server && current.local_version <= entry.local_version && !remaining) {
      await db.recipes.put({ ...server, local_version: current.local_version, sync_status: 'synced' });
    } else if (server) {
      await db.recipes.put({ ...current, version: server.version, sync_status: remaining ? 'pending' : current.sync_status });
    } else if (!remaining) {
      await db.recipes.put({ ...current, version: (result.body as { version?: number }).version ?? current.version + 1, sync_status: 'synced' });
    }
  });
}

async function recordConflict(entry: OutboxOperation, server: Recipe | null): Promise<void> {
  const local = await db.recipes.get(entry.entity_id);
  if (!local || entry.sequence === undefined) return;
  const conflict: RecipeConflict = {
    id: entry.entity_id, entity_id: entry.entity_id, operation_id: entry.operation_id,
    local_recipe: structuredClone(local), server_recipe: server ? structuredClone(server) : null,
    created_at: new Date().toISOString(),
  };
  await db.transaction('rw', db.recipes, db.outbox, db.conflicts, async () => {
    await db.conflicts.put(conflict);
    await db.recipes.update(entry.entity_id, { sync_status: 'conflict' });
    await db.outbox.update(entry.sequence!, { status: 'conflict', last_error_code: 'VERSION_CONFLICT' });
  });
}

async function processEntry(entry: OutboxOperation): Promise<boolean> {
  if (entry.sequence === undefined) return true;
  await db.outbox.update(entry.sequence, { status: 'syncing', last_attempt_at: new Date().toISOString(), attempt_count: entry.attempt_count + 1 });
  try {
    if (entry.type === 'image-upload') {
      const image = await db.images.get(entry.entity_id);
      if (!image?.full_blob) { await markFailed(entry, 'LOCAL_IMAGE_MISSING'); return false; }
      await uploadImage(image.id, image.full_blob, image.width, image.height, entry.operation_id);
      await db.transaction('rw', db.images, db.outbox, async () => {
        await db.images.update(image.id, { remote: true });
        await db.outbox.delete(entry.sequence!);
        await unblockDependents(entry);
      });
      await pruneFullImageCache();
      return true;
    }
    if (entry.type === 'image-delete') {
      await removeImage(entry.entity_id, entry.operation_id);
      await db.transaction('rw', db.images, db.outbox, async () => {
        await db.images.delete(entry.entity_id);
        await db.outbox.delete(entry.sequence!);
        await unblockDependents(entry);
      });
      return true;
    }
    const [result] = await pushOperations([syncOperation(entry)]);
    if (result.status >= 200 && result.status < 300) { await acknowledgeRecipe(entry, result); return true; }
    if (result.status === 409 && result.body.error?.code === 'VERSION_CONFLICT') {
      await recordConflict(entry, result.body.error.details?.current ?? null);
      return true;
    }
    await markFailed(entry, result.body.error?.code ?? `HTTP_${result.status}`);
    return false;
  } catch (cause) {
    if (cause instanceof AuthenticationRequiredError || (cause instanceof ApiError && (cause.status === 401 || cause.status === 403))) {
      if (entry.sequence !== undefined) await db.outbox.update(entry.sequence, { status: 'pending', last_error_code: 'AUTH_REQUIRED' });
      throw new AuthenticationRequiredError();
    }
    await markFailed(entry, cause instanceof ApiError ? `HTTP_${cause.status}` : 'NETWORK_ERROR');
    throw cause;
  }
}

async function processOutbox(): Promise<void> {
  await db.outbox.where('status').equals('syncing').modify({ status: 'pending' });
  while (true) {
    const all = await db.outbox.orderBy('sequence').toArray();
    const ids = new Set(all.map((entry) => entry.operation_id));
    const next = all.find((entry) => (entry.status === 'pending' || entry.status === 'failed') && (!entry.depends_on || !ids.has(entry.depends_on)));
    if (!next) return;
    const continued = await processEntry(next);
    await updatePendingCount();
    if (!continued) return;
  }
}

async function cacheThumbnail(imageId: string): Promise<void> {
  const existing = await db.images.get(imageId);
  if (existing?.thumbnail_blob) return;
  const full = await downloadImage(imageId);
  const thumbnail = await thumbnailFromWebp(full);
  const timestamp = new Date().toISOString();
  const bitmap = await createImageBitmap(full);
  const width = bitmap.width; const height = bitmap.height; bitmap.close();
  await db.images.put({ id: imageId, thumbnail_blob: thumbnail, width, height, byte_size: full.size, remote: true, created_at: timestamp, last_accessed_at: timestamp });
}

export async function ensureFullImage(imageId: string): Promise<void> {
  const existing = await db.images.get(imageId);
  if (existing?.full_blob) {
    await db.images.update(imageId, { last_accessed_at: new Date().toISOString() });
    return;
  }
  const full = await downloadImage(imageId);
  if (existing) await db.images.update(imageId, { full_blob: full, byte_size: full.size, last_accessed_at: new Date().toISOString() });
  else {
    const thumbnail = await thumbnailFromWebp(full);
    const bitmap = await createImageBitmap(full); const width = bitmap.width; const height = bitmap.height; bitmap.close();
    const timestamp = new Date().toISOString();
    await db.images.put({ id: imageId, full_blob: full, thumbnail_blob: thumbnail, width, height, byte_size: full.size, remote: true, created_at: timestamp, last_accessed_at: timestamp });
  }
  await pruneFullImageCache();
}

async function applyServerRecipe(server: Recipe, sequence: number): Promise<void> {
  const local = await db.recipes.get(server.id);
  const pending = (await db.outbox.where('entity_id').equals(server.id).toArray()).find((entry) => entry.type.startsWith('recipe-') && entry.status !== 'conflict');
  if (pending && server.version > pending.base_server_version) {
    await recordConflict(pending, server);
    return;
  }
  if (!pending) await db.recipes.put({ ...server, local_version: local?.local_version ?? 0, sync_status: 'synced' });
  await db.syncMetadata.put({ key: 'change_cursor', value: sequence });
  if (server.image_key) await cacheThumbnail(server.image_key);
}

async function pullChanges(): Promise<void> {
  let cursor = Number((await db.syncMetadata.get('change_cursor'))?.value ?? 0);
  while (true) {
    const page = await getChanges(cursor);
    for (const change of page.changes) {
      if (change.deleted) {
        const pending = (await db.outbox.where('entity_id').equals(change.recipe_id).toArray()).find((entry) => entry.type.startsWith('recipe-'));
        if (pending && change.version > pending.base_server_version) await recordConflict(pending, null);
        else if (!pending) {
          const local = await db.recipes.get(change.recipe_id);
          if (local) await db.recipes.put({ ...local, version: change.version, deleted_at: change.changed_at, updated_at: change.changed_at, sync_status: 'synced' });
        }
        await db.syncMetadata.put({ key: 'change_cursor', value: change.sequence });
      } else if (change.recipe) await applyServerRecipe(change.recipe, change.sequence);
    }
    cursor = page.next_cursor;
    await db.syncMetadata.put({ key: 'change_cursor', value: cursor });
    if (!page.has_more) return;
  }
}

async function runSync(): Promise<void> {
  await updatePendingCount();
  if (!navigator.onLine) { publish({ phase: 'offline', message: null }); return; }
  publish({ phase: 'syncing', message: null });
  try {
    await processOutbox();
    await pullChanges();
    const lastSync = new Date().toISOString();
    await db.syncMetadata.put({ key: 'last_successful_sync', value: lastSync });
    publish({ phase: 'idle', lastSync, message: null });
  } catch (cause) {
    if (cause instanceof AuthenticationRequiredError) publish({ phase: 'auth-required', message: 'Sign in to synchronize pending changes.' });
    else if (!navigator.onLine) publish({ phase: 'offline', message: null });
    else publish({ phase: 'error', message: cause instanceof Error ? cause.message : 'Synchronization failed.' });
  } finally { await updatePendingCount(); }
}

export function syncNow(): Promise<void> {
  if (!activeSync) activeSync = runSync().finally(() => { activeSync = null; });
  return activeSync;
}

export function installSyncTriggers(): () => void {
  const online = () => void syncNow();
  const offline = () => publish({ phase: 'offline' });
  const visible = () => { if (document.visibilityState === 'visible') void syncNow(); };
  window.addEventListener('online', online); window.addEventListener('offline', offline); document.addEventListener('visibilitychange', visible);
  void syncNow();
  return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); document.removeEventListener('visibilitychange', visible); };
}

export async function resolveConflictKeepServer(conflict: RecipeConflict): Promise<void> {
  await db.transaction('rw', db.recipes, db.outbox, db.conflicts, async () => {
    const operations = await db.outbox.where('entity_id').equals(conflict.entity_id).toArray();
    const recipeOperations = operations.filter((item) => item.type.startsWith('recipe-'));
    const operationIds = new Set(recipeOperations.map((item) => item.operation_id));
    const dependents = (await db.outbox.toArray()).filter((item) => item.depends_on && operationIds.has(item.depends_on));
    await db.outbox.bulkDelete([
      ...recipeOperations.flatMap((item) => item.sequence === undefined ? [] : [item.sequence]),
      ...dependents.flatMap((item) => item.type === 'image-delete' && item.sequence !== undefined ? [item.sequence] : []),
    ]);
    const unusedLocalImage = conflict.local_recipe.image_key && conflict.local_recipe.image_key !== conflict.server_recipe?.image_key ? conflict.local_recipe.image_key : null;
    if (unusedLocalImage) await db.outbox.add({
      operation_id: crypto.randomUUID(), entity_id: unusedLocalImage, type: 'image-delete', created_at: new Date().toISOString(),
      last_attempt_at: null, attempt_count: 0, base_server_version: 0, local_version: conflict.local_recipe.local_version,
      status: 'pending', last_error_code: null, depends_on: null,
    });
    if (conflict.server_recipe) await db.recipes.put({ ...conflict.server_recipe, local_version: conflict.local_recipe.local_version, sync_status: 'synced' });
    else await db.recipes.delete(conflict.entity_id);
    await db.conflicts.delete(conflict.id);
  });
  await updatePendingCount();
  void syncNow();
}

export async function resolveConflictKeepLocal(conflict: RecipeConflict, merged?: RecipeDraft): Promise<void> {
  const draft = merged ?? recipeDraft(conflict.local_recipe);
  await db.transaction('rw', db.recipes, db.outbox, db.conflicts, async () => {
    const operations = await db.outbox.where('entity_id').equals(conflict.entity_id).toArray();
    const recipeOperations = operations.filter((item) => item.type.startsWith('recipe-'));
    const operationIds = new Set(recipeOperations.map((item) => item.operation_id));
    const dependents = (await db.outbox.toArray()).filter((item) => item.depends_on && operationIds.has(item.depends_on));
    await db.outbox.bulkDelete(recipeOperations.flatMap((item) => item.sequence === undefined ? [] : [item.sequence]));
    if (!conflict.server_recipe) {
      const restoredId = crypto.randomUUID();
      const timestamp = new Date().toISOString();
      const operationId = crypto.randomUUID();
      await db.recipes.delete(conflict.entity_id);
      await db.recipes.put({ ...conflict.local_recipe, ...draft, id: restoredId, version: 0, local_version: conflict.local_recipe.local_version + 1, sync_status: 'pending', created_at: timestamp, updated_at: timestamp, deleted_at: null });
      await db.outbox.add({
        operation_id: operationId, entity_id: restoredId, type: 'recipe-create', payload: { ...draft, id: restoredId },
        created_at: timestamp, last_attempt_at: null, attempt_count: 0, base_server_version: 0,
        local_version: conflict.local_recipe.local_version + 1, status: 'pending', last_error_code: null, depends_on: null,
      });
      for (const dependent of dependents) if (dependent.sequence !== undefined) await db.outbox.update(dependent.sequence, { depends_on: operationId });
      await db.conflicts.delete(conflict.id);
      return;
    }
    const operationId = crypto.randomUUID();
    await db.outbox.add({
      operation_id: operationId, entity_id: conflict.entity_id, type: 'recipe-update', payload: { ...draft, base_version: conflict.server_recipe!.version },
      created_at: new Date().toISOString(), last_attempt_at: null, attempt_count: 0, base_server_version: conflict.server_recipe!.version,
      local_version: conflict.local_recipe.local_version + 1, status: 'pending', last_error_code: null, depends_on: null,
    });
    for (const dependent of dependents) if (dependent.sequence !== undefined) await db.outbox.update(dependent.sequence, { depends_on: operationId });
    await db.recipes.put({ ...conflict.local_recipe, ...draft, version: conflict.server_recipe!.version, local_version: conflict.local_recipe.local_version + 1, sync_status: 'pending', updated_at: new Date().toISOString() });
    await db.conflicts.delete(conflict.id);
  });
  await updatePendingCount();
  void syncNow();
}

export async function requestPersistentStorage(): Promise<'granted' | 'best-effort' | 'unavailable'> {
  if (!navigator.storage?.persist) return 'unavailable';
  return await navigator.storage.persist() ? 'granted' : 'best-effort';
}
