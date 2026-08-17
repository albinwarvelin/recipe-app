import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createRecipe, deleteRecipe, getRecipe, listIngredientCatalog, recipeChanges, updateRecipe } from '../../worker/data/recipes';
import { recipeInputSchema, recipePatchSchema } from '../../worker/validation/recipes';

describe('recipe aggregate persistence', () => {
  it('creates, replays, version-checks, changes, and soft-deletes a complete recipe', async () => {
    const input = recipeInputSchema.parse({
      title: 'Cloudflare cake',
      description: 'A complete aggregate',
      servings: 4,
      ingredients: [{ amount: '2', unit: 'deciliter', name: 'hemligt pulver' }],
      instructions: [{ text: 'Mix everything.', timer_seconds: 60 }],
      tags: [{ name: 'Dessert' }],
    });
    const createContext = { operationId: crypto.randomUUID(), method: 'POST', path: '/api/recipes', body: input };
    const created = await createRecipe(env.DB, input, createContext);
    expect(created).toMatchObject({ kind: 'success', status: 201, replayed: false });
    if (created.kind !== 'success') throw new Error('Expected recipe creation to succeed');
    const createdRecipe = (created.body as { recipe: { id: string; version: number } }).recipe;

    const replayed = await createRecipe(env.DB, input, createContext);
    expect(replayed).toMatchObject({ kind: 'success', status: 201, replayed: true });

    const stored = await getRecipe(env.DB, createdRecipe.id);
    expect(stored).toMatchObject({
      title: 'Cloudflare cake', version: 1,
      ingredients: [{ amount: '2', unit: 'dl', name: 'Hemligt pulver', catalog_id: expect.any(String) }],
      instructions: [{ text: 'Mix everything.', timer_seconds: 60 }],
      tags: [{ name: 'Dessert' }],
    });
    expect(await env.DB.prepare("SELECT locale, display_name FROM ingredient_catalog_names WHERE locale = 'und' AND normalized_name = 'hemligt pulver'").first())
      .toEqual({ locale: 'und', display_name: 'Hemligt pulver' });

    const patch = recipePatchSchema.parse({ base_version: 1, favorite: true, tags: [{ name: 'dessert' }, { name: 'Tested' }] });
    const updated = await updateRecipe(env.DB, createdRecipe.id, patch, { operationId: crypto.randomUUID(), method: 'PATCH', path: `/api/recipes/${createdRecipe.id}`, body: patch });
    expect(updated).toMatchObject({ kind: 'success', status: 200 });
    expect(await getRecipe(env.DB, createdRecipe.id)).toMatchObject({ favorite: true, version: 2, tags: [{ name: 'Dessert' }, { name: 'Tested' }] });

    const stale = await updateRecipe(env.DB, createdRecipe.id, patch, { operationId: crypto.randomUUID(), method: 'PATCH', path: `/api/recipes/${createdRecipe.id}`, body: patch });
    expect(stale).toMatchObject({ kind: 'conflict', current: { version: 2 } });

    const page = await recipeChanges(env.DB, 0, 100);
    expect(page.changes).toHaveLength(1);
    expect(page.changes[0]).toMatchObject({ recipe_id: createdRecipe.id, version: 2, deleted: false });

    const deleted = await deleteRecipe(env.DB, createdRecipe.id, 2, { operationId: crypto.randomUUID(), method: 'DELETE', path: `/api/recipes/${createdRecipe.id}`, body: { base_version: 2 } });
    expect(deleted).toMatchObject({ kind: 'success', status: 200 });
    expect(await getRecipe(env.DB, createdRecipe.id)).toBeNull();
    expect(await getRecipe(env.DB, createdRecipe.id, true)).toMatchObject({ version: 3, deleted_at: expect.any(String) });
  });

  it('serves bilingual catalogue entries', async () => {
    const catalog = await listIngredientCatalog(env.DB);
    expect(catalog.some((entry) => entry.names.some((name) => name.locale === 'sv' && name.display_name === 'Lax'))).toBe(true);
    expect(catalog.some((entry) => entry.names.some((name) => name.locale === 'en' && name.display_name === 'Salmon'))).toBe(true);
  });
});
