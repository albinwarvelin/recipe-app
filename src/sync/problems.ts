import { apiErrorMessage } from '../api/recipes';
import { db } from '../data/db';

export async function syncProblems() {
  const [recipes, outbox, planning] = await Promise.all([db.recipes.toArray(), db.outbox.toArray(), db.planningOutbox.toArray()]);
  return [
    ...outbox.filter((item) => item.status === 'failed' || item.status === 'conflict').map((item) => {
      const recipe = recipes.find((recipe) => recipe.id === item.entity_id || recipe.image_key === item.entity_id);
      return { ...item, scope: 'recipe' as const, recipeId: recipe?.id, title: recipe?.title ?? 'Bildändring',
        action: item.type === 'image-upload' ? 'Ladda upp omslagsbild' : item.type === 'image-delete' ? 'Ta bort gammal bild' : item.type === 'recipe-cover' ? 'Koppla omslagsbild' : item.type === 'recipe-create' ? 'Skapa recept' : item.type === 'recipe-delete' ? 'Ta bort recept' : 'Uppdatera recept',
        explanation: item.last_error_message ?? apiErrorMessage(item.last_error_status ?? 0, item.last_error_code ?? undefined) };
    }),
    ...planning.filter((item) => item.status === 'failed').map((item) => {
      const plannedRecipeId = 'recipe_id' in item.payload ? item.payload.recipe_id : undefined;
      return { ...item, scope: 'planning' as const, recipeId: undefined,
        title: item.type === 'meal-plan-put' ? recipes.find((recipe) => recipe.id === plannedRecipeId)?.title ?? 'Veckoplanering' : 'Inköpslista', action: item.type === 'meal-plan-put' ? 'Synkronisera planerad måltid' : 'Synkronisera ändring',
        explanation: item.last_error_message ?? apiErrorMessage(item.last_error_status ?? 0, item.last_error_code ?? undefined) };
    }),
  ];
}

export async function retrySyncProblem(scope: 'recipe' | 'planning', operationId: string): Promise<void> {
  const patch = { status: 'pending' as const, failure_kind: null, next_attempt_at: null };
  if (scope === 'recipe') await db.transaction('rw', db.outbox, async () => {
    const entry = await db.outbox.where('operation_id').equals(operationId).first();
    if (!entry || entry.status !== 'failed') return;
    if (entry.type === 'recipe-cover' && entry.failure_kind === 'permanent') {
      // A definitive rejection can be corrected against the latest recipe
      // version; an uncertain response must retain its original request.
      const nextId = crypto.randomUUID();
      await db.outbox.update(entry.sequence!, { ...patch, operation_id: nextId, payload: undefined, attempt_count: 0 });
      await db.outbox.where('depends_on').equals(operationId).modify({ depends_on: nextId });
    } else await db.outbox.update(entry.sequence!, patch);
  });
  else await db.planningOutbox.where('operation_id').equals(operationId).filter((item) => item.status === 'failed').modify(patch);
}
