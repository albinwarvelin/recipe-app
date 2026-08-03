export interface Ingredient {
  id?: string;
  amount: string | null;
  unit: string | null;
  name: string;
  group_name: string | null;
}

export interface Instruction {
  id?: string;
  text: string;
  timer_seconds: number | null;
}

export interface Tag { id?: string; name: string; }

export interface RecipeDraft {
  title: string;
  description: string;
  servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  source_type: 'personal' | 'online' | 'ai';
  source_name: string | null;
  source_url: string | null;
  image_key: string | null;
  notes: string;
  favorite: boolean;
  ingredients: Ingredient[];
  instructions: Instruction[];
  tags: Tag[];
}

export interface Recipe extends RecipeDraft {
  id: string;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface ApiErrorBody {
  error?: { code?: string; message?: string; requestId?: string; details?: { current?: Recipe } };
}

export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly requestId?: string, public readonly current?: Recipe) {
    super(message);
    this.name = 'ApiError';
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: { Accept: 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as ApiErrorBody;
    const detail = body.error;
    throw new ApiError(response.status, detail?.message ?? `Request failed (${response.status}).`, detail?.requestId, detail?.details?.current);
  }
  return response.json() as Promise<T>;
}

function writeInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'RecipeApp', 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify(body),
  };
}

export async function getRecipes(signal?: AbortSignal): Promise<Recipe[]> {
  return (await api<{ recipes: Recipe[] }>('/api/recipes', { signal })).recipes;
}

export async function createRecipe(draft: RecipeDraft): Promise<Recipe> {
  return (await api<{ recipe: Recipe }>('/api/recipes', writeInit('POST', draft))).recipe;
}

export async function replaceRecipe(recipe: Recipe, draft: RecipeDraft): Promise<Recipe> {
  return (await api<{ recipe: Recipe }>(`/api/recipes/${recipe.id}`, writeInit('PUT', { ...draft, base_version: recipe.version }))).recipe;
}

export async function setFavorite(recipe: Recipe, favorite: boolean): Promise<Recipe> {
  return (await api<{ recipe: Recipe }>(`/api/recipes/${recipe.id}`, writeInit('PATCH', { base_version: recipe.version, favorite }))).recipe;
}

export async function removeRecipe(recipe: Recipe): Promise<void> {
  await api(`/api/recipes/${recipe.id}`, writeInit('DELETE', { base_version: recipe.version }));
}

export interface ChangePage {
  changes: Array<{ sequence: number; recipe_id: string; version: number; changed_at: string; deleted: boolean; recipe: Recipe | null }>;
  next_cursor: number;
}

export function getChanges(cursor: number): Promise<ChangePage> {
  return api<ChangePage>(`/api/sync/changes?cursor=${cursor}&limit=100`);
}
