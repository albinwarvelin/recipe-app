import { describe, expect, it } from 'vitest';
import type { Recipe, RecipeDraft } from '../../src/api/recipes';
import { defaultConflictChoices, mergeConflictDraft } from '../../src/components/ConflictResolution';
import type { LocalRecipe, RecipeConflict } from '../../src/data/db';

const draft: RecipeDraft = {
  title: 'Lokal titel', description: 'Lokal beskrivning', servings: 2, prep_minutes: 10, cook_minutes: 20,
  source_type: 'personal', source_name: null, source_url: null, image_key: '10000000-0000-4000-8000-000000000001',
  notes: 'Lokala anteckningar', favorite: false,
  ingredients: [{ id: '20000000-0000-4000-8000-000000000001', catalog_id: null, amount: '1', unit: 'dl', name: 'Lokalt', group_name: null }],
  instructions: [{ id: '30000000-0000-4000-8000-000000000001', text: 'Lokalt steg', timer_seconds: null }],
  tags: [{ id: '40000000-0000-4000-8000-000000000001', name: 'Lokalt' }],
};

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return { ...structuredClone(draft), id: '50000000-0000-4000-8000-000000000001', version: 2, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z', deleted_at: null, ...overrides };
}

function conflict(): RecipeConflict {
  const local: LocalRecipe = { ...recipe(), local_version: 3, sync_status: 'conflict' };
  const server = recipe({
    title: 'Servertitel', description: 'Serverbeskrivning', servings: 4, favorite: true,
    ingredients: [{ id: '20000000-0000-4000-8000-000000000002', catalog_id: null, amount: '2', unit: 'dl', name: 'Server', group_name: null }],
    tags: [{ id: '40000000-0000-4000-8000-000000000002', name: 'Server' }],
  });
  return { id: local.id, entity_id: local.id, operation_id: crypto.randomUUID(), local_recipe: local, server_recipe: server, created_at: '2026-01-03T00:00:00.000Z' };
}

describe('conflict draft merging', () => {
  it('keeps the complete local draft by default', () => {
    expect(mergeConflictDraft(conflict(), defaultConflictChoices())).toEqual(draft);
  });

  it('selects scalar fields independently and structured content by section', () => {
    const choices = defaultConflictChoices();
    choices.title = 'server';
    choices.favorite = 'server';
    choices.ingredients = 'server';
    const merged = mergeConflictDraft(conflict(), choices);
    expect(merged).toMatchObject({ title: 'Servertitel', description: 'Lokal beskrivning', favorite: true });
    expect(merged.ingredients).toMatchObject([{ name: 'Server' }]);
    expect(merged.tags).toMatchObject([{ name: 'Lokalt' }]);
  });
});
