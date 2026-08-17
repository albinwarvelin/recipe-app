import { z } from 'zod';
import {
  ingredientSchema,
  instructionSchema,
  recipeDraftSchema,
  recipeLimits,
  scalarRecipeSchema,
  tagArraySchema,
  tagInputSchema,
} from '../../shared/recipe-validation';

export { ingredientSchema, instructionSchema, tagInputSchema } from '../../shared/recipe-validation';

export const recipeInputSchema = recipeDraftSchema.extend({ id: z.string().uuid().optional() }).strict();

export const recipePutSchema = scalarRecipeSchema.extend({
  base_version: z.number().int().positive(),
  ingredients: z.array(ingredientSchema).max(recipeLimits.ingredients).default([]),
  instructions: z.array(instructionSchema).max(recipeLimits.instructions).default([]),
  tags: tagArraySchema.default([]),
}).strict();

export const recipePatchSchema = scalarRecipeSchema.partial().extend({
  base_version: z.number().int().positive(),
  ingredients: z.array(ingredientSchema).max(recipeLimits.ingredients).optional(),
  instructions: z.array(instructionSchema).max(recipeLimits.instructions).optional(),
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
