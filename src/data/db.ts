import Dexie, { type EntityTable } from 'dexie';
import type { Recipe, RecipeDraft } from '../api/recipes';

export type LocalSyncStatus = 'synced' | 'pending' | 'conflict';
export type OutboxStatus = 'pending' | 'syncing' | 'failed' | 'conflict';
export type OutboxType = 'recipe-create' | 'recipe-update' | 'recipe-delete' | 'image-upload' | 'image-delete';

export interface LocalRecipe extends Recipe {
  local_version: number;
  sync_status: LocalSyncStatus;
}

export interface LocalImage {
  id: string;
  full_blob?: Blob;
  thumbnail_blob: Blob;
  width: number;
  height: number;
  byte_size: number;
  remote: boolean;
  created_at: string;
  last_accessed_at: string;
}

export interface OutboxOperation {
  sequence?: number;
  operation_id: string;
  entity_id: string;
  type: OutboxType;
  payload?: RecipeDraft & { id?: string; base_version?: number };
  created_at: string;
  last_attempt_at: string | null;
  attempt_count: number;
  base_server_version: number;
  local_version: number;
  status: OutboxStatus;
  last_error_code: string | null;
  depends_on: string | null;
}

export interface LocalTag { id: string; name: string; normalized_name: string; }

export interface SyncMetadata {
  key: string;
  value: string | number | boolean | null;
}

export interface RecipeConflict {
  id: string;
  entity_id: string;
  operation_id: string;
  local_recipe: LocalRecipe;
  server_recipe: Recipe | null;
  created_at: string;
}

class RecipeDatabase extends Dexie {
  recipes!: EntityTable<LocalRecipe, 'id'>;
  images!: EntityTable<LocalImage, 'id'>;
  outbox!: EntityTable<OutboxOperation, 'sequence'>;
  tags!: EntityTable<LocalTag, 'id'>;
  syncMetadata!: EntityTable<SyncMetadata, 'key'>;
  conflicts!: EntityTable<RecipeConflict, 'id'>;

  constructor() {
    super('recipe-app');
    this.version(1).stores({
      recipes: '&id, updated_at, favorite, deleted_at, sync_status',
      images: '&id, remote, last_accessed_at',
      outbox: '++sequence, &operation_id, entity_id, type, status, created_at, depends_on',
      tags: '&id, &normalized_name, name',
      syncMetadata: '&key',
      conflicts: '&id, &entity_id, operation_id, created_at',
    });
    // IndexedDB keys cannot be booleans. Version 2 removes the boolean indexes
    // while preserving the stored favorite/remote fields themselves.
    this.version(2).stores({
      recipes: '&id, updated_at, sync_status',
      images: '&id, last_accessed_at',
    });
  }
}

export const db = new RecipeDatabase();

export async function clearLocalData(): Promise<void> {
  await db.transaction('rw', [db.recipes, db.images, db.outbox, db.tags, db.syncMetadata, db.conflicts], async () => {
    await Promise.all([db.recipes.clear(), db.images.clear(), db.outbox.clear(), db.tags.clear(), db.syncMetadata.clear(), db.conflicts.clear()]);
  });
}
