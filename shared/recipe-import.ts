import { z } from 'zod';
import type { RecipeDraft } from '../src/api/recipes';
import { recipeLimits } from './recipe-validation';

export const MAX_RECIPE_IMPORT_CHARACTERS = 100_000;

const nullableText = (maximum: number) => z.string().trim().max(maximum).transform((value) => value || null).nullable().optional().default(null);
const nullableMinutes = z.number().int().min(0).max(recipeLimits.minutes).nullable().optional().default(null);
const nullableHttpUrl = z.string().trim().url().max(recipeLimits.sourceUrl)
  .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), 'Only http and https URLs are accepted.')
  .nullable().optional().default(null);

const importIngredientSchema = z.object({
  amount: nullableText(recipeLimits.ingredientAmount),
  unit: nullableText(recipeLimits.ingredientUnit),
  name: z.string().trim().max(recipeLimits.ingredientName).optional().default(''),
  group: nullableText(recipeLimits.ingredientGroup),
}).strict();

const importInstructionSchema = z.object({
  text: z.string().trim().max(recipeLimits.instructionText).optional().default(''),
  timer_hours: z.number().int().min(0).max(recipeLimits.timerSeconds / 3_600).nullable().optional().default(null),
  timer_minutes: z.number().int().min(0).max(recipeLimits.timerSeconds / 60).nullable().optional().default(null),
}).strict().superRefine((instruction, context) => {
  if (instruction.timer_hours !== null && instruction.timer_minutes !== null && instruction.timer_minutes >= 60) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['timer_minutes'], message: 'Minutes must be below 60 when hours are provided.' });
  }
  const totalSeconds = ((instruction.timer_hours ?? 0) * 60 + (instruction.timer_minutes ?? 0)) * 60;
  if (totalSeconds > recipeLimits.timerSeconds) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['timer_hours'], message: 'The timer duration is too long.' });
  }
});

const importRecipeSchema = z.object({
  title: z.string().trim().max(recipeLimits.title).optional().default(''),
  description: z.string().trim().max(recipeLimits.description).optional().default(''),
  servings: z.number().int().min(1).max(recipeLimits.servings).nullable().optional().default(null),
  prep_minutes: nullableMinutes,
  cook_minutes: nullableMinutes,
  source_type: z.enum(['ai', 'online']).optional().default('ai'),
  source_name: nullableText(recipeLimits.sourceName),
  source_url: nullableHttpUrl,
  image_url: nullableHttpUrl,
  notes: z.string().trim().max(recipeLimits.notes).optional().default(''),
  ingredients: z.array(importIngredientSchema).max(recipeLimits.ingredients).optional().default([]),
  instructions: z.array(importInstructionSchema).max(recipeLimits.instructions).optional().default([]),
  tags: z.array(z.string().trim().min(1).max(recipeLimits.tagName)).max(recipeLimits.tags).optional().default([]),
}).strict().superRefine((recipe, context) => {
  if (recipe.source_type === 'online' && !recipe.source_url) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['source_url'], message: 'Online recipes require a source URL.' });
  }
});

export const recipeImportSchema = z.object({
  format: z.literal('recipe-app'),
  version: z.literal(1),
  recipe: importRecipeSchema,
}).strict();

export const RECIPE_IMPORT_TEMPLATE = JSON.stringify({
  format: 'recipe-app',
  version: 1,
  recipe: {
    title: 'Receptnamn',
    description: 'Kort beskrivning',
    servings: 4,
    prep_minutes: 15,
    cook_minutes: 30,
    source_type: 'ai',
    source_name: null,
    source_url: null,
    image_url: null,
    notes: '',
    ingredients: [{ amount: '2', unit: 'dl', name: 'Vetemjöl', group: null }],
    instructions: [{ text: 'Låt degen jäsa över natten.', timer_hours: 12, timer_minutes: 0 }],
    tags: ['Middag'],
  },
}, null, 2);

export const RECIPE_IMPORT_AI_INSTRUCTION = `Sammanfatta receptet och svara med giltig JSON enligt mallen nedan.

Regler:
- Använd inga Markdown-kodblock och skriv ingen text före eller efter JSON-objektet.
- Bevara receptets språk.
- Hitta inte på mängder eller portioner. Ange heltal och använd null när de uppgifterna saknas.
- Var noggrann med tidsuppgifterna. Ange alltid prep_minutes och cook_minutes som hela minuter. Använd källans tid när den finns; uppskatta annars en realistisk tid utifrån arbetsmomenten.
- Ange timer_hours och timer_minutes för varje steg som har en meningsfull varaktighet, till exempel kokning, stekning, bakning, vila, jäsning, marinering eller kylning. Använd timmar och återstående minuter för tider på minst en timme, till exempel 12 timmar som timer_hours 12 och timer_minutes 0, aldrig 720 minuter. Använd källans tid när den finns och en realistisk uppskattning annars. Om källan anger ett intervall, använd en rimlig heltalsuppskattning inom intervallet.
- Håll mängd och enhet separerade. Mängd ska vara text, till exempel "2" eller "1/2".
- Använd svenska metriska kortformer när enheten kan uttryckas entydigt: krm, tsk, msk, ml, cl, dl, l, g, kg och st.
- Lägg varje arbetsmoment i en separat instruktion.
- Använd source_type "online" och ange originalets webbplats och URL när receptet kommer från en webbsida. Använd annars source_type "ai".
- Ange image_url som en direkt, offentlig http- eller https-adress till receptets primära bild när en sådan finns. Använd null om adressen saknas eller är osäker. Lägg aldrig in bilddata, base64, en webbsidesadress eller en påhittad bildadress i image_url.
- Följ fälten i mallen exakt och lägg inte till andra fält.
- Taggar ska vara korta, generella kategorier som beskriver receptet. Använd inte ingredienser eller andra detaljer som taggar.

JSON-mall:
${RECIPE_IMPORT_TEMPLATE}`;

function stripSingleCodeFence(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match?.[1]?.trim() ?? trimmed;
}

function jsonLocation(input: string, message: string): string | null {
  const match = message.match(/position\s+(\d+)/i);
  if (!match) return null;
  const position = Math.min(Number(match[1]), input.length);
  const before = input.slice(0, position);
  const line = before.split('\n').length;
  const lastBreak = before.lastIndexOf('\n');
  return `rad ${line}, kolumn ${position - lastBreak}`;
}

function issuePath(path: PropertyKey[]): string {
  if (!path.length) return 'JSON-objektet';
  return path.reduce<string>((result, part) => typeof part === 'number' ? `${result}[${part + 1}]` : result ? `${result}.${String(part)}` : String(part), '');
}

export class RecipeImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecipeImportError';
  }
}

export interface ParsedRecipeImport {
  draft: RecipeDraft;
  imageUrl: string | null;
}

export function parseRecipeImport(raw: string): ParsedRecipeImport {
  if (!raw.trim()) throw new RecipeImportError('Klistra in ett JSON-recept först.');
  if (raw.length > MAX_RECIPE_IMPORT_CHARACTERS) throw new RecipeImportError('JSON-innehållet är för långt.');
  const input = stripSingleCodeFence(raw);
  let value: unknown;
  try {
    value = JSON.parse(input) as unknown;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : '';
    const location = jsonLocation(input, message);
    throw new RecipeImportError(`JSON-innehållet kunde inte läsas${location ? ` (${location})` : ''}.`);
  }
  const parsed = recipeImportSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue.code === 'unrecognized_keys') {
      throw new RecipeImportError(`Okänt fält i ${issuePath(issue.path)}: ${issue.keys.join(', ')}.`);
    }
    if (issue.code === 'custom' && issue.path.at(-1) === 'source_url') {
      throw new RecipeImportError('Recept från en webbsida måste ha en giltig http- eller https-adress.');
    }
    if (issue.code === 'custom' && issue.path.at(-1) === 'image_url') {
      throw new RecipeImportError('Bildadressen måste vara en giltig http- eller https-adress.');
    }
    throw new RecipeImportError(`Ogiltigt värde i ${issuePath(issue.path)}.`);
  }
  const recipe = parsed.data.recipe;
  return {
    imageUrl: recipe.image_url,
    draft: {
      title: recipe.title,
      description: recipe.description,
      servings: recipe.servings,
      prep_minutes: recipe.prep_minutes,
      cook_minutes: recipe.cook_minutes,
      source_type: recipe.source_type,
      source_name: recipe.source_name,
      source_url: recipe.source_url,
      image_key: null,
      notes: recipe.notes,
      favorite: false,
      ingredients: recipe.ingredients.map((ingredient) => ({
        catalog_id: null,
        amount: ingredient.amount,
        unit: ingredient.unit,
        name: ingredient.name,
        group_name: ingredient.group,
      })),
      instructions: recipe.instructions.map((instruction) => ({
        text: instruction.text,
        timer_seconds: instruction.timer_hours === null && instruction.timer_minutes === null
          ? null
          : ((instruction.timer_hours ?? 0) * 60 + (instruction.timer_minutes ?? 0)) * 60 || null,
      })),
      tags: recipe.tags.map((name) => ({ name })),
    },
  };
}
