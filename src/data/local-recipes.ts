import type { RecipeDraft } from '../api/recipes';
import type { PreparedCoverImage } from '../images/process';
import { db, type LocalImage, type LocalIngredientCatalog, type LocalRecipe, type OutboxOperation } from './db';
import { normalizeDisplayName, normalizeIdentityValue, normalizeUnit } from './normalize';
import { validateRecipeDraft } from './validate-recipe';

export type CoverChange = { kind: 'keep' } | { kind: 'remove' } | { kind: 'replace'; image: PreparedCoverImage };

function now(): string { return new Date().toISOString(); }

export function sanitizeRecipeDraft(draft: RecipeDraft): RecipeDraft {
  return {
    title: draft.title,
    description: draft.description,
    servings: draft.servings,
    prep_minutes: draft.prep_minutes,
    cook_minutes: draft.cook_minutes,
    source_type: draft.source_type,
    source_name: draft.source_name,
    source_url: draft.source_url,
    image_key: draft.image_key,
    notes: draft.notes,
    favorite: draft.favorite,
    ingredients: draft.ingredients.map((item) => ({
      ...(item.id ? { id: item.id } : {}),
      catalog_id: item.catalog_id ?? null,
      amount: item.amount,
      unit: item.unit,
      name: item.name,
      group_name: item.group_name,
    })),
    instructions: draft.instructions.map((item) => ({
      ...(item.id ? { id: item.id } : {}),
      text: item.text,
      timer_seconds: item.timer_seconds,
    })),
    tags: draft.tags.map((item) => ({ ...(item.id ? { id: item.id } : {}), name: item.name })),
  };
}

async function withStableChildren(rawDraft: RecipeDraft): Promise<{ draft: RecipeDraft; newCatalogEntries: LocalIngredientCatalog[] }> {
  const draft = validateRecipeDraft(sanitizeRecipeDraft(rawDraft));
  const catalog = await db.ingredientCatalog.toArray();
  const tags = await db.tags.toArray();
  const catalogByName = new Map(catalog.flatMap((entry) => entry.names.map((name) => [normalizeIdentityValue(name.display_name), entry] as const)));
  const tagsByName = new Map(tags.map((tag) => [normalizeIdentityValue(tag.name), tag] as const));
  const newCatalogEntries: LocalIngredientCatalog[] = [];
  const normalizedTags = new Map<string, RecipeDraft['tags'][number]>();
  for (const tag of draft.tags) {
    const name = normalizeDisplayName(tag.name);
    const normalized = normalizeIdentityValue(name);
    if (!normalized || normalizedTags.has(normalized)) continue;
    const known = tagsByName.get(normalized);
    normalizedTags.set(normalized, { id: known?.id ?? tag.id ?? crypto.randomUUID(), name: known?.name ?? name });
  }
  const prepared: RecipeDraft = {
    ...draft,
    ingredients: draft.ingredients.map((item) => {
      const name = normalizeDisplayName(item.name);
      const normalized = normalizeIdentityValue(name);
      const known = item.catalog_id ? catalog.find((entry) => entry.id === item.catalog_id) : catalogByName.get(normalized);
      const catalogId = known?.id ?? item.catalog_id ?? crypto.randomUUID();
      if (!known && !newCatalogEntries.some((entry) => entry.id === catalogId)) {
        newCatalogEntries.push({
          id: catalogId,
          category: null,
          user_created: true,
          names: [{ locale: 'und', display_name: name, normalized_name: normalized, preferred: true }],
        });
      }
      return { ...item, id: item.id ?? crypto.randomUUID(), catalog_id: catalogId, name, unit: normalizeUnit(item.unit) };
    }),
    instructions: draft.instructions.map((item) => ({ ...item, id: item.id ?? crypto.randomUUID() })),
    tags: [...normalizedTags.values()],
  };
  return { draft: prepared, newCatalogEntries };
}

export function draftFromLocalRecipe(recipe: LocalRecipe): RecipeDraft {
  return sanitizeRecipeDraft(recipe);
}

async function refreshTags(): Promise<void> {
  const recipes = await db.recipes.toArray();
  const tags = new Map<string, { id: string; name: string; normalized_name: string }>();
  for (const recipe of recipes) if (!recipe.deleted_at) for (const tag of recipe.tags) {
    const normalized_name = normalizeIdentityValue(tag.name);
    tags.set(normalized_name, { id: tag.id ?? crypto.randomUUID(), name: tag.name, normalized_name });
  }
  await db.tags.clear();
  await db.tags.bulkPut([...tags.values()]);
}

function imageRecord(image: PreparedCoverImage, timestamp: string): LocalImage {
  return {
    id: image.id, full_blob: image.full, thumbnail_blob: image.thumbnail,
    width: image.width, height: image.height, byte_size: image.full.size,
    remote: false, created_at: timestamp, last_accessed_at: timestamp,
  };
}

function operation(type: OutboxOperation['type'], entityId: string, timestamp: string, localVersion: number, baseVersion: number, payload?: OutboxOperation['payload'], dependsOn?: string): OutboxOperation {
  return {
    operation_id: crypto.randomUUID(), entity_id: entityId, type, payload,
    created_at: timestamp, last_attempt_at: null, attempt_count: 0,
    base_server_version: baseVersion, local_version: localVersion,
    status: 'pending', last_error_code: null, failure_kind: null, next_attempt_at: null,
    depends_on: dependsOn ?? null,
  };
}

async function pendingRecipeOperation(recipeId: string): Promise<OutboxOperation | undefined> {
  const entries = await db.outbox.where('entity_id').equals(recipeId).toArray();
  return entries.reverse().find((entry) => entry.type.startsWith('recipe-') && (entry.status === 'pending' || entry.status === 'failed'));
}

export async function saveLocalRecipe(existing: LocalRecipe | null, rawDraft: RecipeDraft, cover: CoverChange): Promise<LocalRecipe> {
  const timestamp = now();
  const recipeId = existing?.id ?? crypto.randomUUID();
  const { draft, newCatalogEntries } = await withStableChildren(rawDraft);
  const priorImageId = existing?.image_key ?? null;
  const imageId = cover.kind === 'replace' ? cover.image.id : cover.kind === 'remove' ? null : priorImageId;
  draft.image_key = imageId;
  const localVersion = (existing?.local_version ?? 0) + 1;
  const local: LocalRecipe = {
    ...draft,
    id: recipeId,
    version: existing?.version ?? 0,
    local_version: localVersion,
    sync_status: 'pending',
    created_at: existing?.created_at ?? timestamp,
    updated_at: timestamp,
    deleted_at: null,
  };

  await db.transaction('rw', db.recipes, db.images, db.outbox, db.tags, db.ingredientCatalog, async () => {
    if (newCatalogEntries.length) await db.ingredientCatalog.bulkPut(newCatalogEntries);
    let uploadOperation: OutboxOperation | undefined;
    if (cover.kind === 'replace') {
      await db.images.put(imageRecord(cover.image, timestamp));
      uploadOperation = operation('image-upload', cover.image.id, timestamp, localVersion, 0);
      await db.outbox.add(uploadOperation);
    }

    const pending = await pendingRecipeOperation(recipeId);
    let recipeOperation: OutboxOperation;
    if (pending && pending.status !== 'syncing') {
      const nextDependency = uploadOperation?.operation_id ?? (cover.kind === 'remove' ? null : pending.depends_on);
      if (pending.depends_on && pending.depends_on !== nextDependency) {
        const obsoleteDependency = await db.outbox.where('operation_id').equals(pending.depends_on).first();
        if (obsoleteDependency?.type === 'image-upload' && obsoleteDependency.sequence !== undefined) {
          await db.outbox.delete(obsoleteDependency.sequence);
        }
      }
      recipeOperation = {
        ...pending,
        type: pending.type === 'recipe-create' ? 'recipe-create' : 'recipe-update',
        payload: { ...draft, ...(pending.type === 'recipe-create' ? { id: recipeId } : { base_version: pending.base_server_version }) },
        local_version: localVersion, status: 'pending', last_error_code: null, failure_kind: null, next_attempt_at: null,
        depends_on: nextDependency,
      };
      await db.outbox.put(recipeOperation);
    } else {
      recipeOperation = operation(
        existing ? 'recipe-update' : 'recipe-create', recipeId, timestamp, localVersion, existing?.version ?? 0,
        { ...draft, ...(existing ? { base_version: existing.version } : { id: recipeId }) },
        uploadOperation?.operation_id,
      );
      await db.outbox.add(recipeOperation);
    }

    if (priorImageId && priorImageId !== imageId) {
      await db.outbox.add(operation('image-delete', priorImageId, timestamp, localVersion, 0, undefined, recipeOperation.operation_id));
    }
    await db.recipes.put(local);
    await refreshTags();
  });
  return local;
}

export async function setLocalFavorite(recipe: LocalRecipe, favorite: boolean): Promise<LocalRecipe> {
  return saveLocalRecipe(recipe, { ...draftFromLocalRecipe(recipe), favorite }, { kind: 'keep' });
}

export async function deleteLocalRecipe(recipe: LocalRecipe): Promise<void> {
  const timestamp = now();
  await db.transaction('rw', db.recipes, db.images, db.outbox, db.tags, async () => {
    const pending = await pendingRecipeOperation(recipe.id);
    if (recipe.version === 0 && pending?.type === 'recipe-create' && pending.status !== 'syncing') {
      const operations = await db.outbox.where('entity_id').equals(recipe.id).toArray();
      if (pending.sequence !== undefined) await db.outbox.delete(pending.sequence);
      if (recipe.image_key) {
        const imageOperations = await db.outbox.where('entity_id').equals(recipe.image_key).toArray();
        await db.outbox.bulkDelete(imageOperations.flatMap((item) => item.sequence === undefined ? [] : [item.sequence]));
        await db.images.delete(recipe.image_key);
      }
      await db.recipes.delete(recipe.id);
      void operations;
    } else {
      const localVersion = recipe.local_version + 1;
      let deleteOperation: OutboxOperation;
      if (pending && pending.status !== 'syncing') {
        deleteOperation = { ...pending, type: 'recipe-delete', payload: undefined, local_version: localVersion, status: 'pending', last_error_code: null, failure_kind: null, next_attempt_at: null };
        await db.outbox.put(deleteOperation);
      } else {
        deleteOperation = operation('recipe-delete', recipe.id, timestamp, localVersion, recipe.version, undefined, pending?.operation_id);
        await db.outbox.add(deleteOperation);
      }
      if (recipe.image_key) await db.outbox.add(operation('image-delete', recipe.image_key, timestamp, localVersion, 0, undefined, deleteOperation.operation_id));
      await db.recipes.put({ ...recipe, local_version: localVersion, sync_status: 'pending', deleted_at: timestamp, updated_at: timestamp });
    }
    await refreshTags();
  });
}
