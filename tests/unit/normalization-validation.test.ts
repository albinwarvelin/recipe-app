import { describe, expect, it } from 'vitest';
import { normalizeIdentityValue, normalizeSearchValue } from '../../src/data/normalize';
import { RecipeValidationError, validateRecipeDraft } from '../../src/data/validate-recipe';
import type { RecipeDraft } from '../../src/api/recipes';

const draft: RecipeDraft = {
  title: ' Crème brûlée ', description: '', servings: null, prep_minutes: null, cook_minutes: null,
  source_type: 'personal', source_name: null, source_url: null, image_key: null,
  notes: '', favorite: false, ingredients: [], instructions: [], tags: [],
};

describe('recipe normalization and validation', () => {
  it('keeps diacritics for identity while folding them for search', () => {
    expect(normalizeIdentityValue('  Crème   Brûlée ')).toBe('crème brûlée');
    expect(normalizeSearchValue('  Crème   Brûlée ')).toBe('creme brulee');
    expect(normalizeIdentityValue('Crème')).not.toBe(normalizeIdentityValue('Creme'));
  });

  it('returns a trimmed, validated draft', () => {
    expect(validateRecipeDraft(draft).title).toBe('Crème brûlée');
  });

  it('rejects invalid recipe values with a Swedish field message', () => {
    expect(() => validateRecipeDraft({ ...draft, title: '' })).toThrow(RecipeValidationError);
    expect(() => validateRecipeDraft({ ...draft, title: '' })).toThrow('Receptnamnet');
  });
});
