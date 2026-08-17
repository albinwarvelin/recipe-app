export interface Ingredient {
  id?: string;
  catalog_id?: string | null;
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

export interface IngredientCatalogName {
  locale: string;
  display_name: string;
  normalized_name: string;
  preferred: boolean;
}

export interface IngredientCatalogEntry {
  id: string;
  category: string | null;
  user_created: boolean;
  names: IngredientCatalogName[];
}

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

export class AuthenticationRequiredError extends Error {
  constructor() { super('Sign in is required to synchronize.'); this.name = 'AuthenticationRequiredError'; }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    redirect: 'manual',
    ...init,
    headers: { Accept: 'application/json', ...init?.headers },
  });
  if ((response.type as string) === 'opaqueredirect' || response.status === 0 || response.status === 302) throw new AuthenticationRequiredError();
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

export async function getIngredientCatalog(signal?: AbortSignal): Promise<IngredientCatalogEntry[]> {
  return (await api<{ ingredients: IngredientCatalogEntry[] }>('/api/ingredients', { signal })).ingredients;
}

export async function getTags(signal?: AbortSignal): Promise<Tag[]> {
  return (await api<{ tags: Tag[] }>('/api/tags', { signal })).tags;
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
  has_more: boolean;
}

export function getChanges(cursor: number): Promise<ChangePage> {
  return api<ChangePage>(`/api/sync/changes?cursor=${cursor}&limit=100`);
}

export type SyncOperation =
  | { operation_id: string; type: 'create'; payload: RecipeDraft & { id: string } }
  | { operation_id: string; type: 'update'; entity_id: string; payload: RecipeDraft & { base_version: number } }
  | { operation_id: string; type: 'delete'; entity_id: string; base_version: number };

export interface SyncResult {
  operation_id: string;
  status: number;
  body: { recipe?: Recipe; deleted?: boolean; error?: { code?: string; message?: string; details?: { current?: Recipe } } };
}

export async function pushOperations(operations: SyncOperation[]): Promise<SyncResult[]> {
  return (await api<{ results: SyncResult[] }>('/api/sync', writeInit('POST', { operations }))).results;
}

export interface UploadedImage {
  id: string;
  content_type: 'image/webp';
  width: number;
  height: number;
  byte_size: number;
  created_at: string;
}

export async function uploadImage(imageId: string, blob: Blob, width: number, height: number, operationId: string): Promise<UploadedImage> {
  return (await api<{ image: UploadedImage }>(`/api/images/${imageId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'image/webp',
      'X-Requested-With': 'RecipeApp',
      'Idempotency-Key': operationId,
      'X-Image-Width': String(width),
      'X-Image-Height': String(height),
    },
    body: blob,
  })).image;
}

export async function downloadImage(imageId: string): Promise<Blob> {
  const response = await fetch(`/api/images/${imageId}`, { credentials: 'same-origin', redirect: 'manual' });
  if ((response.type as string) === 'opaqueredirect' || response.status === 0 || response.status === 302 || response.status === 401 || response.status === 403) {
    throw new AuthenticationRequiredError();
  }
  if (!response.ok || response.headers.get('Content-Type')?.split(';')[0] !== 'image/webp') {
    throw new ApiError(response.status, `Image download failed (${response.status}).`);
  }
  return response.blob();
}

export async function removeImage(imageId: string, operationId: string): Promise<void> {
  await api(`/api/images/${imageId}`, {
    method: 'DELETE',
    headers: { 'X-Requested-With': 'RecipeApp', 'Idempotency-Key': operationId },
  });
}
