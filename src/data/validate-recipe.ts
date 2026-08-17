import type { RecipeDraft } from '../api/recipes';
import { recipeDraftSchema } from '../../shared/recipe-validation';

const fieldNames: Record<string, string> = {
  title: 'Receptnamnet',
  description: 'Beskrivningen',
  servings: 'Antalet portioner',
  prep_minutes: 'Förberedelsetiden',
  cook_minutes: 'Tillagningstiden',
  source_name: 'Källnamnet',
  source_url: 'Källadressen',
  notes: 'Anteckningarna',
  ingredients: 'Ingredienserna',
  amount: 'Mängden',
  unit: 'Enheten',
  name: 'Namnet',
  group_name: 'Gruppnamnet',
  instructions: 'Instruktionerna',
  text: 'Instruktionen',
  timer_seconds: 'Timern',
  tags: 'Taggarna',
};

export class RecipeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecipeValidationError';
  }
}

function issueMessage(path: PropertyKey[], code: string): string {
  const key = [...path].reverse().find((part) => typeof part === 'string') as string | undefined;
  const field = key ? fieldNames[key] ?? 'Fältet' : 'Receptet';
  if (code === 'too_small') return `${field} är tomt eller har ett för lågt värde.`;
  if (code === 'too_big') return `${field} överskrider den tillåtna gränsen.`;
  if (code === 'invalid_string' || code === 'invalid_format') return `${field} har ett ogiltigt format.`;
  if (code === 'custom' && key === 'name' && path.includes('tags')) return 'Varje tagg måste vara unik.';
  return `${field} innehåller ett ogiltigt värde.`;
}

export function validateRecipeDraft(draft: RecipeDraft): RecipeDraft {
  const parsed = recipeDraftSchema.safeParse(draft);
  if (parsed.success) {
    const value = parsed.data;
    return {
      ...value,
      servings: value.servings ?? null,
      prep_minutes: value.prep_minutes ?? null,
      cook_minutes: value.cook_minutes ?? null,
      source_name: value.source_name ?? null,
      source_url: value.source_url ?? null,
      image_key: value.image_key ?? null,
      ingredients: value.ingredients.map((item) => ({
        ...item,
        catalog_id: item.catalog_id ?? null,
        amount: item.amount ?? null,
        unit: item.unit ?? null,
        group_name: item.group_name ?? null,
      })),
      instructions: value.instructions.map((item) => ({ ...item, timer_seconds: item.timer_seconds ?? null })),
    };
  }
  const issue = parsed.error.issues[0];
  throw new RecipeValidationError(issueMessage(issue.path, issue.code));
}
