import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearLocalData, db } from '../../src/data/db';
import { deleteLocalRecipe, sanitizeRecipeDraft, saveLocalRecipe, setLocalFavorite } from '../../src/data/local-recipes';
import type { RecipeDraft } from '../../src/api/recipes';

const emptyRecipeDraft: RecipeDraft = {
  title: '', description: '', servings: null, prep_minutes: null, cook_minutes: null,
  source_type: 'personal', source_name: null, source_url: null, image_key: null,
  notes: '', favorite: false, ingredients: [], instructions: [], tags: [],
};

describe('local-first recipe repository', () => {
  beforeEach(async () => clearLocalData());

  it('commits a recipe and its durable outbox operation together', async () => {
    const recipe = await saveLocalRecipe(null, { ...emptyRecipeDraft, title: 'Offline soup' }, { kind: 'keep' });
    expect(await db.recipes.get(recipe.id)).toMatchObject({ title: 'Offline soup', sync_status: 'pending', version: 0 });
    expect(await db.outbox.toArray()).toMatchObject([{ entity_id: recipe.id, type: 'recipe-create', status: 'pending', local_version: 1 }]);

    db.close();
    await db.open();
    expect(await db.recipes.get(recipe.id)).toMatchObject({ title: 'Offline soup' });
    expect(await db.outbox.count()).toBe(1);
  });

  it('collapses repeated unsent changes into the pending create', async () => {
    const recipe = await saveLocalRecipe(null, { ...emptyRecipeDraft, title: 'First title' }, { kind: 'keep' });
    await setLocalFavorite(recipe, true);
    const operations = await db.outbox.toArray();
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({ type: 'recipe-create', local_version: 2, payload: { title: 'First title', favorite: true } });
    expect(operations[0].payload).not.toHaveProperty('local_version');
    expect(operations[0].payload).not.toHaveProperty('sync_status');
  });

  it('removes client-only fields from legacy queued recipe payloads', () => {
    const legacyPayload = {
      ...emptyRecipeDraft,
      title: 'Legacy favorite',
      local_version: 2,
      sync_status: 'pending',
    } as RecipeDraft;

    expect(sanitizeRecipeDraft(legacyPayload)).toEqual({ ...emptyRecipeDraft, title: 'Legacy favorite' });
  });

  it('orders an offline cover upload before the recipe that references it', async () => {
    const imageId = crypto.randomUUID();
    const recipe = await saveLocalRecipe(null, { ...emptyRecipeDraft, title: 'Photographed pie' }, {
      kind: 'replace', image: { id: imageId, full: new Blob(['full'], { type: 'image/webp' }), thumbnail: new Blob(['thumb'], { type: 'image/webp' }), width: 1200, height: 800 },
    });
    expect(await db.images.get(imageId)).toMatchObject({ id: imageId, remote: false, width: 1200 });
    const operations = await db.outbox.orderBy('sequence').toArray();
    expect(operations.map((entry) => entry.type)).toEqual(['image-upload', 'recipe-create']);
    expect(operations[1].depends_on).toBe(operations[0].operation_id);
    expect(recipe.image_key).toBe(imageId);
  });

  it('removes a never-synchronized recipe instead of uploading a create and delete', async () => {
    const recipe = await saveLocalRecipe(null, { ...emptyRecipeDraft, title: 'Temporary' }, { kind: 'keep' });
    await deleteLocalRecipe(recipe);
    expect(await db.recipes.get(recipe.id)).toBeUndefined();
    expect(await db.outbox.count()).toBe(0);
  });
});
