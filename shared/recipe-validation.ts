import { z } from 'zod';
import { normalizeIdentityValue } from './normalize';

export const recipeLimits = {
  title: 200,
  description: 5_000,
  servings: 1_000,
  minutes: 10_000,
  sourceName: 500,
  sourceUrl: 2_000,
  notes: 10_000,
  ingredients: 100,
  ingredientAmount: 80,
  ingredientUnit: 80,
  ingredientName: 300,
  ingredientGroup: 120,
  instructions: 100,
  instructionText: 5_000,
  timerSeconds: 86_400,
  tags: 50,
  tagName: 80,
} as const;

const nullableShortText = z.string().trim().max(recipeLimits.sourceName).nullable().optional();
const nullableNonNegativeInteger = z.number().int().min(0).max(recipeLimits.minutes).nullable().optional();

export const ingredientSchema = z.object({
  id: z.string().uuid().optional(),
  catalog_id: z.string().uuid().nullable().optional(),
  amount: z.string().trim().max(recipeLimits.ingredientAmount).nullable().optional(),
  unit: z.string().trim().max(recipeLimits.ingredientUnit).nullable().optional(),
  name: z.string().trim().min(1).max(recipeLimits.ingredientName),
  group_name: z.string().trim().max(recipeLimits.ingredientGroup).nullable().optional(),
}).strict();

export const instructionSchema = z.object({
  id: z.string().uuid().optional(),
  text: z.string().trim().min(1).max(recipeLimits.instructionText),
  timer_seconds: z.number().int().min(0).max(recipeLimits.timerSeconds).nullable().optional(),
}).strict();

export const tagInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(recipeLimits.tagName),
}).strict();

export const tagArraySchema = z.array(tagInputSchema).max(recipeLimits.tags).superRefine((tags, context) => {
  const seen = new Set<string>();
  tags.forEach((tag, index) => {
    const normalized = normalizeIdentityValue(tag.name);
    if (seen.has(normalized)) context.addIssue({ code: z.ZodIssueCode.custom, path: [index, 'name'], message: 'Tag names must be unique.' });
    seen.add(normalized);
  });
});

export const scalarRecipeSchema = z.object({
  title: z.string().trim().min(1).max(recipeLimits.title),
  description: z.string().trim().max(recipeLimits.description).default(''),
  servings: z.number().int().min(1).max(recipeLimits.servings).nullable().optional(),
  prep_minutes: nullableNonNegativeInteger,
  cook_minutes: nullableNonNegativeInteger,
  source_type: z.enum(['personal', 'online', 'ai']).default('personal'),
  source_name: nullableShortText,
  source_url: z.string().url().max(recipeLimits.sourceUrl).nullable().optional(),
  image_key: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(recipeLimits.notes).default(''),
  favorite: z.boolean().default(false),
});

export const recipeDraftSchema = scalarRecipeSchema.extend({
  ingredients: z.array(ingredientSchema).max(recipeLimits.ingredients).default([]),
  instructions: z.array(instructionSchema).max(recipeLimits.instructions).default([]),
  tags: tagArraySchema.default([]),
}).strict();
