import { describe, expect, it } from 'vitest';
import { parseRecipeImport, RECIPE_IMPORT_AI_INSTRUCTION, RECIPE_IMPORT_TEMPLATE, RecipeImportError } from '../../shared/recipe-import';

describe('recipe JSON import', () => {
  it('maps an AI-friendly document into the internal recipe draft', () => {
    const { draft, imageUrl } = parseRecipeImport(JSON.stringify({
      format: 'recipe-app', version: 1,
      recipe: {
        title: 'Soppa', servings: 4, source_type: 'ai',
        ingredients: [{ amount: '2', unit: 'dl', name: 'Ärtor', group: 'Bas' }],
        instructions: [{ text: 'Koka.', timer_minutes: 12 }],
        tags: ['Middag'],
      },
    }));
    expect(draft).toMatchObject({
      title: 'Soppa', servings: 4, source_type: 'ai', image_key: null, favorite: false,
      ingredients: [{ amount: '2', unit: 'dl', name: 'Ärtor', group_name: 'Bas', catalog_id: null }],
      instructions: [{ text: 'Koka.', timer_seconds: 720 }], tags: [{ name: 'Middag' }],
    });
    expect(imageUrl).toBeNull();
  });

  it('accepts an attributed online recipe', () => {
    expect(parseRecipeImport(JSON.stringify({
      format: 'recipe-app', version: 1,
      recipe: { source_type: 'online', source_name: 'Exempelköket', source_url: 'https://example.com/recept', image_url: 'https://cdn.example.com/recept.jpg' },
    }))).toMatchObject({
      imageUrl: 'https://cdn.example.com/recept.jpg',
      draft: { source_type: 'online', source_name: 'Exempelköket', source_url: 'https://example.com/recept' },
    });
  });

  it('maps long timers from hours and remaining minutes while retaining minute-only compatibility', () => {
    const { draft } = parseRecipeImport(JSON.stringify({
      format: 'recipe-app', version: 1,
      recipe: { instructions: [
        { text: 'Jäs över natten.', timer_hours: 12, timer_minutes: 30 },
        { text: 'Äldre format.', timer_minutes: 720 },
      ] },
    }));
    expect(draft.instructions).toMatchObject([
      { timer_seconds: 45_000 },
      { timer_seconds: 43_200 },
    ]);
  });

  it('uses editable defaults for omitted recipe fields and accepts a single JSON code fence', () => {
    const { draft } = parseRecipeImport('```json\n{"format":"recipe-app","version":1,"recipe":{}}\n```');
    expect(draft).toMatchObject({ title: '', servings: null, ingredients: [], instructions: [], tags: [] });
  });

  it('rejects online imports without a source URL', () => {
    expect(() => parseRecipeImport('{"format":"recipe-app","version":1,"recipe":{"source_type":"online"}}'))
      .toThrow('webbsida');
  });

  it('rejects unknown fields instead of silently discarding them', () => {
    expect(() => parseRecipeImport('{"format":"recipe-app","version":1,"recipe":{"photo_url":"https://example.com/image.jpg"}}'))
      .toThrow(RecipeImportError);
    expect(() => parseRecipeImport('{"format":"recipe-app","version":1,"recipe":{"photo_url":"https://example.com/image.jpg"}}'))
      .toThrow('photo_url');
  });

  it('documents estimated preparation, cooking, step times, and a separate image URL', () => {
    expect(RECIPE_IMPORT_AI_INSTRUCTION).toContain('Ange alltid prep_minutes och cook_minutes');
    expect(RECIPE_IMPORT_AI_INSTRUCTION).toContain('uppskatta annars en realistisk tid');
    expect(RECIPE_IMPORT_AI_INSTRUCTION).toContain('timer_hours och timer_minutes');
    expect(RECIPE_IMPORT_AI_INSTRUCTION).toContain('aldrig 720 minuter');
    expect(RECIPE_IMPORT_AI_INSTRUCTION).toContain('direkt, offentlig http- eller https-adress');
    const template = JSON.parse(RECIPE_IMPORT_TEMPLATE).recipe;
    expect(template).toHaveProperty('image_url', null);
    expect(template.instructions[0]).toMatchObject({ timer_hours: 12, timer_minutes: 0 });
  });
});
