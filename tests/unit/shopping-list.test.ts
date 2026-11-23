import { describe, expect, it } from 'vitest';
import type { LocalIngredientCatalog, LocalMealPlanEntry, LocalRecipe } from '../../src/data/db';
import { buildShoppingList, parseIngredientAmount } from '../../src/planning/shopping-list';

function recipe(id: string, title: string, amount: string | null, unit: string, name: string, catalogId: string, servings = 4): LocalRecipe {
  return {
    id, title, description: '', servings, prep_minutes: null, cook_minutes: null,
    source_type: 'personal', source_name: null, source_url: null, image_key: null, notes: '', favorite: false,
    ingredients: [{ id: crypto.randomUUID(), catalog_id: catalogId, amount, unit, name, group_name: null }],
    instructions: [], tags: [], version: 1, local_version: 1, sync_status: 'synced',
    created_at: '2026-08-01T10:00:00.000Z', updated_at: '2026-08-01T10:00:00.000Z', deleted_at: null,
  };
}

function plan(id: string, recipeId: string, servings: number | null, multiplier = 1): LocalMealPlanEntry {
  return {
    id, recipe_id: recipeId, planned_date: '2026-08-31', servings, multiplier, position: 0,
    version: 1, local_version: 1, sync_status: 'synced', created_at: '2026-08-01T10:00:00.000Z', updated_at: '2026-08-01T10:00:00.000Z', deleted_at: null,
  };
}

describe('live shopping list aggregation', () => {
  it('parses decimals, fractions, mixed numbers, unicode fractions, and ranges', () => {
    expect(parseIngredientAmount('2,5')).toEqual({ minimum: 2.5, maximum: 2.5 });
    expect(parseIngredientAmount('1/2')).toEqual({ minimum: .5, maximum: .5 });
    expect(parseIngredientAmount('1 1/2')).toEqual({ minimum: 1.5, maximum: 1.5 });
    expect(parseIngredientAmount('1½')).toEqual({ minimum: 1.5, maximum: 1.5 });
    expect(parseIngredientAmount('2–3')).toEqual({ minimum: 2, maximum: 3 });
    expect(parseIngredientAmount('efter smak')).toBeNull();
  });

  it('scales portions and combines compatible metric units by catalogue identity', () => {
    const catalogId = crypto.randomUUID();
    const first = recipe(crypto.randomUUID(), 'Soppa', '500', 'g', 'Tomat', catalogId);
    const second = recipe(crypto.randomUUID(), 'Pasta', '1', 'kg', 'Tomater', catalogId);
    const catalog: LocalIngredientCatalog[] = [{ id: catalogId, category: 'vegetable', user_created: false, names: [] }];
    const items = buildShoppingList([plan(crypto.randomUUID(), first.id, 8), plan(crypto.randomUUID(), second.id, 4)], [first, second], catalog);
    expect(items).toMatchObject([{ name: 'Tomat', category: 'Grönsaker', amount: '2', unit: 'kg', sources: ['Pasta', 'Soppa'], unparsed: false }]);
  });

  it('keeps an unparseable amount labelled with its recipe', () => {
    const catalogId = crypto.randomUUID();
    const salt = recipe(crypto.randomUUID(), 'Tomatsoppa', 'efter smak', '', 'Salt', catalogId);
    const items = buildShoppingList([plan(crypto.randomUUID(), salt.id, 4)], [salt], []);
    expect(items).toMatchObject([{ name: 'Salt', amount: 'efter smak', unit: null, sources: ['Tomatsoppa'], unparsed: true }]);
  });

  it('merges missing amounts when the same recipe is planned more than once', () => {
    const catalogId = crypto.randomUUID();
    const pasta = recipe(crypto.randomUUID(), 'Krämig pasta', null, '', 'Salt', catalogId);
    const items = buildShoppingList([
      plan(crypto.randomUUID(), pasta.id, 4),
      plan(crypto.randomUUID(), pasta.id, 4),
    ], [pasta], []);
    expect(items).toMatchObject([{ name: 'Salt', amount: null, sources: ['Krämig pasta'], unparsed: true }]);
  });

  it('lists every source recipe once for a shared amount-less ingredient', () => {
    const catalogId = crypto.randomUUID();
    const pasta = recipe(crypto.randomUUID(), 'Krämig pasta', null, '', 'Salt', catalogId);
    const stew = recipe(crypto.randomUUID(), 'Tomatgryta', null, '', 'Salt', catalogId);
    const items = buildShoppingList([
      plan(crypto.randomUUID(), pasta.id, 4),
      plan(crypto.randomUUID(), stew.id, 4),
    ], [pasta, stew], []);
    expect(items).toMatchObject([{ name: 'Salt', amount: null, sources: ['Krämig pasta', 'Tomatgryta'], unparsed: true }]);
  });
});
