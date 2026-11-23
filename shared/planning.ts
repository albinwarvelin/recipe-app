import { z } from 'zod';

export const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Date must be a valid YYYY-MM-DD value.');

const timestampSchema = z.string().datetime({ offset: true });
const nullableText = (maximum: number) => z.string().trim().max(maximum).nullable();
const commonEntitySchema = z.object({
  id: z.string().min(1).max(360),
  created_at: timestampSchema,
  updated_at: timestampSchema,
  deleted_at: timestampSchema.nullable(),
});

export const mealPlanInputSchema = commonEntitySchema.extend({
  id: z.string().uuid(),
  recipe_id: z.string().uuid(),
  planned_date: dateKeySchema,
  servings: z.number().int().min(1).max(1_000).nullable(),
  multiplier: z.number().int().min(1).max(20),
  position: z.number().int().min(0).max(10_000),
}).strict();

export const manualShoppingItemInputSchema = commonEntitySchema.extend({
  id: z.string().uuid(),
  week_start: dateKeySchema,
  name: z.string().trim().min(1).max(120),
  amount: nullableText(40),
  unit: nullableText(24),
  checked: z.boolean(),
}).strict();

export const shoppingCheckStateInputSchema = commonEntitySchema.extend({
  id: z.string().min(1).max(360),
  week_start: dateKeySchema,
  item_key: z.string().min(1).max(320),
  source_signature: z.string().min(1).max(1_024),
  checked: z.boolean(),
}).strict();

export const planningOperationSchema = z.discriminatedUnion('type', [
  z.object({ operation_id: z.string().uuid(), type: z.literal('meal-plan-put'), payload: mealPlanInputSchema }).strict(),
  z.object({ operation_id: z.string().uuid(), type: z.literal('manual-item-put'), payload: manualShoppingItemInputSchema }).strict(),
  z.object({ operation_id: z.string().uuid(), type: z.literal('check-state-put'), payload: shoppingCheckStateInputSchema }).strict(),
]);

export const planningSyncRequestSchema = z.object({
  operations: z.array(planningOperationSchema).min(1).max(50).superRefine((operations, context) => {
    const seen = new Set<string>();
    operations.forEach((operation, index) => {
      if (seen.has(operation.operation_id)) context.addIssue({ code: z.ZodIssueCode.custom, path: [index, 'operation_id'], message: 'Operation IDs must be unique within a sync request.' });
      seen.add(operation.operation_id);
    });
  }),
}).strict();

export type MealPlanInput = z.infer<typeof mealPlanInputSchema>;
export type ManualShoppingItemInput = z.infer<typeof manualShoppingItemInputSchema>;
export type ShoppingCheckStateInput = z.infer<typeof shoppingCheckStateInputSchema>;
export type PlanningOperation = z.infer<typeof planningOperationSchema>;
export type PlanningEntityType = 'meal-plan' | 'manual-item' | 'check-state';

export interface MealPlanEntry extends MealPlanInput { version: number; }
export interface ManualShoppingItem extends ManualShoppingItemInput { version: number; }
export interface ShoppingCheckState extends ShoppingCheckStateInput { version: number; }
export type PlanningEntity = MealPlanEntry | ManualShoppingItem | ShoppingCheckState;

export interface PlanningChange {
  sequence: number;
  entity_type: PlanningEntityType;
  entity_id: string;
  version: number;
  changed_at: string;
  deleted: boolean;
  entity: PlanningEntity | null;
}

export interface PlanningChangePage {
  changes: PlanningChange[];
  next_cursor: number;
  has_more: boolean;
}

