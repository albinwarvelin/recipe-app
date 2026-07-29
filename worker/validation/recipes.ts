import { z } from 'zod';

const nullableText = z.string().trim().max(500).nullable().optional();

export const recipeInputSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5_000).default(''),
  servings: z.number().int().min(1).max(1_000).nullable().optional(),
  prep_minutes: z.number().int().min(0).max(10_000).nullable().optional(),
  cook_minutes: z.number().int().min(0).max(10_000).nullable().optional(),
  source_type: z.enum(['personal', 'online', 'ai']).default('personal'),
  source_name: nullableText,
  source_url: z.string().url().max(2_000).nullable().optional(),
  image_key: nullableText,
  notes: z.string().trim().max(10_000).default(''),
  favorite: z.boolean().default(false),
}).strict();

export const recipePatchSchema = recipeInputSchema.partial().omit({ id: true });
export type RecipeInput = z.infer<typeof recipeInputSchema>;
export type RecipePatch = z.infer<typeof recipePatchSchema>;
