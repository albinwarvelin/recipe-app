import { z } from 'zod';

const nullableShortText = z.string().trim().max(500).nullable().optional();
const nullableNonNegativeInteger = z.number().int().min(0).max(10_000).nullable().optional();

export const ingredientSchema = z.object({
  id: z.string().uuid().optional(),
  amount: z.string().trim().max(80).nullable().optional(),
  unit: z.string().trim().max(80).nullable().optional(),
  name: z.string().trim().min(1).max(300),
  group_name: z.string().trim().max(120).nullable().optional(),
}).strict();

export const instructionSchema = z.object({
  id: z.string().uuid().optional(),
  text: z.string().trim().min(1).max(5_000),
  timer_seconds: z.number().int().min(0).max(86_400).nullable().optional(),
}).strict();

export const tagInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
}).strict();

const tagArraySchema = z.array(tagInputSchema).max(50).superRefine((tags, context) => {
  const seen = new Set<string>();
  tags.forEach((tag, index) => {
    const normalized = tag.name.toLowerCase();
    if (seen.has(normalized)) context.addIssue({ code: z.ZodIssueCode.custom, path: [index, 'name'], message: 'Tag names must be unique.' });
    seen.add(normalized);
  });
});

const scalarRecipeSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5_000).default(''),
  servings: z.number().int().min(1).max(1_000).nullable().optional(),
  prep_minutes: nullableNonNegativeInteger,
  cook_minutes: nullableNonNegativeInteger,
  source_type: z.enum(['personal', 'online', 'ai']).default('personal'),
  source_name: nullableShortText,
  source_url: z.string().url().max(2_000).nullable().optional(),
  image_key: nullableShortText,
  notes: z.string().trim().max(10_000).default(''),
  favorite: z.boolean().default(false),
});

export const recipeInputSchema = scalarRecipeSchema.extend({
  id: z.string().uuid().optional(),
  ingredients: z.array(ingredientSchema).max(100).default([]),
  instructions: z.array(instructionSchema).max(100).default([]),
  tags: tagArraySchema.default([]),
}).strict();

export const recipePutSchema = scalarRecipeSchema.extend({
  base_version: z.number().int().positive(),
  ingredients: z.array(ingredientSchema).max(100).default([]),
  instructions: z.array(instructionSchema).max(100).default([]),
  tags: tagArraySchema.default([]),
}).strict();

export const recipePatchSchema = scalarRecipeSchema.partial().extend({
  base_version: z.number().int().positive(),
  ingredients: z.array(ingredientSchema).max(100).optional(),
  instructions: z.array(instructionSchema).max(100).optional(),
  tags: tagArraySchema.optional(),
}).strict().refine((value) => Object.keys(value).some((key) => key !== 'base_version'), 'At least one change is required.');

export const recipeDeleteSchema = z.object({ base_version: z.number().int().positive() }).strict();

export const tagCreateSchema = tagInputSchema.omit({ id: true });

export const changesQuerySchema = z.object({
  cursor: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const syncOperationSchema = z.discriminatedUnion('type', [
  z.object({ operation_id: z.string().uuid(), type: z.literal('create'), payload: recipeInputSchema }).strict(),
  z.object({ operation_id: z.string().uuid(), type: z.literal('update'), entity_id: z.string().uuid(), payload: recipePatchSchema }).strict(),
  z.object({ operation_id: z.string().uuid(), type: z.literal('delete'), entity_id: z.string().uuid(), base_version: z.number().int().positive() }).strict(),
]);

export const syncRequestSchema = z.object({
  operations: z.array(syncOperationSchema).min(1).max(50).superRefine((operations, context) => {
    const seen = new Set<string>();
    operations.forEach((operation, index) => {
      if (seen.has(operation.operation_id)) context.addIssue({ code: z.ZodIssueCode.custom, path: [index, 'operation_id'], message: 'Operation IDs must be unique within a sync request.' });
      seen.add(operation.operation_id);
    });
  }),
}).strict();

export type RecipeInput = z.infer<typeof recipeInputSchema>;
export type RecipePut = z.infer<typeof recipePutSchema>;
export type RecipePatch = z.infer<typeof recipePatchSchema>;
export type IngredientInput = z.infer<typeof ingredientSchema>;
export type InstructionInput = z.infer<typeof instructionSchema>;
export type TagInput = z.infer<typeof tagInputSchema>;
