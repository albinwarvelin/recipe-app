import { listIngredientCatalog } from '../data/recipes';
import { error, json } from '../http';

export async function ingredientRoute(request: Request, env: Env, id: string): Promise<Response> {
  if (request.method !== 'GET') return error('METHOD_NOT_ALLOWED', 'Method is not supported for this route.', 405, id);
  return json({ ingredients: await listIngredientCatalog(env.DB) }, 200, id);
}
