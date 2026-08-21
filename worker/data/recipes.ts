import { findProcessedOperation, processedOperationStatement, requestFingerprint } from '../idempotency';
import { normalizeDisplayName, normalizeIdentityValue, normalizeSearchValue, normalizeUnit } from '../normalization';
import type { IngredientInput, InstructionInput, RecipeInput, RecipePatch, RecipePut, TagInput } from '../validation/recipes';

interface RecipeRow {
  id: string;
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
  favorite: number;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface IngredientRow {
  id: string;
  recipe_id: string;
  position: number;
  catalog_id: string | null;
  amount: string | null;
  unit: string | null;
  name: string;
  group_name: string | null;
}

interface InstructionRow {
  id: string;
  recipe_id: string;
  position: number;
  text: string;
  timer_seconds: number | null;
}

export interface Tag {
  id: string;
  name: string;
}

interface IngredientCatalogNameRow {
  ingredient_id: string;
  locale: string;
  display_name: string;
  normalized_name: string;
  preferred: number;
}

export interface IngredientCatalogEntry {
  id: string;
  category: string | null;
  user_created: boolean;
  names: Array<Omit<IngredientCatalogNameRow, 'ingredient_id' | 'preferred'> & { preferred: boolean }>;
}

interface TagRow extends Tag {
  recipe_id: string;
  position: number;
}

export interface Recipe {
  id: string;
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
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  ingredients: Array<Omit<IngredientRow, 'recipe_id' | 'position'>>;
  instructions: Array<Omit<InstructionRow, 'recipe_id' | 'position'>>;
  tags: Tag[];
}

export type MutationResult =
  | { kind: 'success'; status: number; body: unknown; replayed: boolean }
  | { kind: 'not_found' }
  | { kind: 'conflict'; current: Recipe }
  | { kind: 'idempotency_reuse' };

interface MutationContext {
  operationId: string;
  method: string;
  path: string;
  body: unknown;
}

function aggregateRows(
  recipes: RecipeRow[],
  ingredients: IngredientRow[],
  instructions: InstructionRow[],
  tags: TagRow[]
): Recipe[] {
  const byId = new Map<string, Recipe>();
  for (const row of recipes) {
    byId.set(row.id, {
      ...row,
      favorite: row.favorite === 1,
      ingredients: [],
      instructions: [],
      tags: [],
    });
  }
  for (const { recipe_id, position: _position, ...ingredient } of ingredients) byId.get(recipe_id)?.ingredients.push(ingredient);
  for (const { recipe_id, position: _position, ...instruction } of instructions) byId.get(recipe_id)?.instructions.push(instruction);
  for (const { recipe_id, position: _position, ...tag } of tags) byId.get(recipe_id)?.tags.push(tag);
  return recipes.map((row) => byId.get(row.id)).filter((recipe): recipe is Recipe => Boolean(recipe));
}

export async function listRecipes(db: D1Database): Promise<Recipe[]> {
  const [recipeResult, ingredientResult, instructionResult, tagResult] = await Promise.all([
    db.prepare('SELECT * FROM recipes WHERE deleted_at IS NULL ORDER BY updated_at DESC').all<RecipeRow>(),
    db.prepare('SELECT i.* FROM ingredients i JOIN recipes r ON r.id = i.recipe_id WHERE r.deleted_at IS NULL ORDER BY i.recipe_id, i.position').all<IngredientRow>(),
    db.prepare('SELECT i.* FROM instructions i JOIN recipes r ON r.id = i.recipe_id WHERE r.deleted_at IS NULL ORDER BY i.recipe_id, i.position').all<InstructionRow>(),
    db.prepare('SELECT rt.recipe_id, rt.position, t.id, t.name FROM recipe_tags rt JOIN tags t ON t.id = rt.tag_id JOIN recipes r ON r.id = rt.recipe_id WHERE r.deleted_at IS NULL ORDER BY rt.recipe_id, rt.position').all<TagRow>(),
  ]);
  return aggregateRows(
    recipeResult.results,
    ingredientResult.results,
    instructionResult.results,
    tagResult.results
  );
}

export async function getRecipe(db: D1Database, recipeId: string, includeDeleted = false): Promise<Recipe | null> {
  const activeClause = includeDeleted ? '' : ' AND deleted_at IS NULL';
  const [recipeResult, ingredientResult, instructionResult, tagResult] = await Promise.all([
    db.prepare(`SELECT * FROM recipes WHERE id = ?1${activeClause}`).bind(recipeId).all<RecipeRow>(),
    db.prepare('SELECT * FROM ingredients WHERE recipe_id = ?1 ORDER BY position').bind(recipeId).all<IngredientRow>(),
    db.prepare('SELECT * FROM instructions WHERE recipe_id = ?1 ORDER BY position').bind(recipeId).all<InstructionRow>(),
    db.prepare('SELECT rt.recipe_id, rt.position, t.id, t.name FROM recipe_tags rt JOIN tags t ON t.id = rt.tag_id WHERE rt.recipe_id = ?1 ORDER BY rt.position').bind(recipeId).all<TagRow>(),
  ]);
  return aggregateRows(
    recipeResult.results,
    ingredientResult.results,
    instructionResult.results,
    tagResult.results
  )[0] ?? null;
}

export async function listTags(db: D1Database): Promise<Tag[]> {
  const result = await db.prepare(
    'SELECT DISTINCT t.id, t.name FROM tags t JOIN recipe_tags rt ON rt.tag_id = t.id JOIN recipes r ON r.id = rt.recipe_id WHERE r.deleted_at IS NULL ORDER BY t.normalized_name'
  ).all<Tag>();
  return result.results;
}

export async function listIngredientCatalog(db: D1Database): Promise<IngredientCatalogEntry[]> {
  const [entries, names] = await Promise.all([
    db.prepare('SELECT id, category, user_created FROM ingredient_catalog ORDER BY id').all<{ id: string; category: string | null; user_created: number }>(),
    db.prepare("SELECT ingredient_id, locale, display_name, normalized_name, preferred FROM ingredient_catalog_names ORDER BY ingredient_id, CASE locale WHEN 'sv' THEN 0 WHEN 'en' THEN 1 ELSE 2 END, display_name").all<IngredientCatalogNameRow>(),
  ]);
  const namesById = new Map<string, IngredientCatalogEntry['names']>();
  for (const { ingredient_id, preferred, ...name } of names.results) {
    const list = namesById.get(ingredient_id) ?? [];
    list.push({ ...name, preferred: preferred === 1 });
    namesById.set(ingredient_id, list);
  }
  return entries.results.map((entry) => ({ ...entry, user_created: entry.user_created === 1, names: namesById.get(entry.id) ?? [] }));
}

async function resolveTags(db: D1Database, inputs: TagInput[], now: string): Promise<Array<Tag & { normalizedName: string; created: boolean }>> {
  if (inputs.length === 0) return [];
  const displayNames = inputs.map((tag) => normalizeDisplayName(tag.name));
  const normalizedNames = displayNames.map(normalizeIdentityValue);
  const existing = await Promise.all(normalizedNames.map((name, index) => {
    return db.prepare(
      'SELECT id, name, normalized_name FROM tags WHERE normalized_name = ?1 OR normalized_name = ?2 ORDER BY CASE WHEN normalized_name = ?1 THEN 0 ELSE 1 END LIMIT 1'
    ).bind(name, normalizeSearchValue(displayNames[index])).first<Tag & { normalized_name: string }>();
  }));
  return inputs.map((tag, index) => {
    const row = existing[index];
    return {
      id: row?.id ?? tag.id ?? crypto.randomUUID(),
      name: row?.name ?? displayNames[index],
      normalizedName: row?.normalized_name ?? normalizedNames[index],
      created: !row,
    };
  });
}

interface CatalogRegistration { id: string; name: string; normalizedName: string; }
type ResolvedIngredient = Omit<IngredientRow, 'recipe_id' | 'position'>;

async function resolveIngredients(db: D1Database, inputs: IngredientInput[]): Promise<{ ingredients: ResolvedIngredient[]; registrations: CatalogRegistration[] }> {
  const registrations: CatalogRegistration[] = [];
  const createdByName = new Map<string, string>();
  const ingredients: ResolvedIngredient[] = [];
  for (const input of inputs) {
    const name = normalizeDisplayName(input.name);
    const normalizedName = normalizeIdentityValue(name);
    const legacyNormalizedName = normalizeSearchValue(name);
    const selected = input.catalog_id
      ? await db.prepare('SELECT id FROM ingredient_catalog WHERE id = ?1').bind(input.catalog_id).first<{ id: string }>()
      : null;
    const matched = selected ?? await db.prepare(
      'SELECT ingredient_id AS id FROM ingredient_catalog_names WHERE normalized_name = ?1 OR normalized_name = ?2 ORDER BY CASE WHEN normalized_name = ?1 THEN 0 ELSE 1 END LIMIT 1'
    ).bind(normalizedName, legacyNormalizedName).first<{ id: string }>();
    let catalogId = matched?.id ?? createdByName.get(normalizedName);
    if (!catalogId) {
      catalogId = input.catalog_id ?? crypto.randomUUID();
      createdByName.set(normalizedName, catalogId);
      registrations.push({ id: catalogId, name, normalizedName });
    }
    ingredients.push({
      id: input.id ?? crypto.randomUUID(), catalog_id: catalogId,
      amount: input.amount ?? null, unit: normalizeUnit(input.unit), name,
      group_name: input.group_name ?? null,
    });
  }
  return { ingredients, registrations };
}

function normalizedRecipe(input: RecipeInput, now: string, ingredients: ResolvedIngredient[]): Recipe {
  return {
    id: input.id ?? crypto.randomUUID(),
    title: input.title,
    description: input.description,
    servings: input.servings ?? null,
    prep_minutes: input.prep_minutes ?? null,
    cook_minutes: input.cook_minutes ?? null,
    source_type: input.source_type,
    source_name: input.source_name ?? null,
    source_url: input.source_url ?? null,
    image_key: input.image_key ?? null,
    notes: input.notes,
    favorite: input.favorite,
    version: 1,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    ingredients,
    instructions: input.instructions.map((entry) => ({
      id: entry.id ?? crypto.randomUUID(), text: entry.text, timer_seconds: entry.timer_seconds ?? null,
    })),
    tags: input.tags.map((tag) => ({ id: tag.id ?? crypto.randomUUID(), name: tag.name })),
  };
}

function recipeStatements(db: D1Database, recipe: Recipe, resolvedTags: Awaited<ReturnType<typeof resolveTags>>, registrations: CatalogRegistration[]): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];
  registrations.forEach((entry) => {
    statements.push(db.prepare(
      'INSERT OR IGNORE INTO ingredient_catalog (id, category, user_created, created_at, updated_at) VALUES (?1, NULL, 1, ?2, ?2)'
    ).bind(entry.id, recipe.updated_at));
    statements.push(db.prepare(
      "INSERT OR IGNORE INTO ingredient_catalog_names (ingredient_id, locale, display_name, normalized_name, preferred) VALUES (?1, 'und', ?2, ?3, 1)"
    ).bind(entry.id, entry.name, entry.normalizedName));
  });
  recipe.ingredients.forEach((ingredient, position) => statements.push(db.prepare(
    'INSERT INTO ingredients (id, recipe_id, position, amount, unit, name, group_name, catalog_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)'
  ).bind(ingredient.id, recipe.id, position, ingredient.amount, ingredient.unit, ingredient.name, ingredient.group_name, ingredient.catalog_id)));
  recipe.instructions.forEach((instruction, position) => statements.push(db.prepare(
    'INSERT INTO instructions (id, recipe_id, position, text, timer_seconds) VALUES (?1, ?2, ?3, ?4, ?5)'
  ).bind(instruction.id, recipe.id, position, instruction.text, instruction.timer_seconds)));
  resolvedTags.forEach((tag, position) => {
    statements.push(db.prepare(
      'INSERT OR IGNORE INTO tags (id, name, normalized_name, created_at) VALUES (?1, ?2, ?3, ?4)'
    ).bind(tag.id, tag.name, tag.normalizedName, recipe.updated_at));
    statements.push(db.prepare(
      'INSERT INTO recipe_tags (recipe_id, tag_id, position) SELECT ?1, id, ?2 FROM tags WHERE normalized_name = ?3'
    ).bind(recipe.id, position, tag.normalizedName));
  });
  return statements;
}

async function replayOrReuse(db: D1Database, context: MutationContext, fingerprint: string): Promise<MutationResult | null> {
  const processed = await findProcessedOperation(db, context.operationId);
  if (!processed) return null;
  if (processed.request_hash !== fingerprint || processed.method !== context.method || processed.path !== context.path) {
    return { kind: 'idempotency_reuse' };
  }
  return { kind: 'success', status: processed.response_status, body: JSON.parse(processed.response_json) as unknown, replayed: true };
}

export async function createRecipe(db: D1Database, input: RecipeInput, context: MutationContext): Promise<MutationResult> {
  const fingerprint = await requestFingerprint(context.method, context.path, context.body);
  const replay = await replayOrReuse(db, context, fingerprint);
  if (replay) return replay;
  const now = new Date().toISOString();
  const resolvedIngredients = await resolveIngredients(db, input.ingredients);
  const recipe = normalizedRecipe(input, now, resolvedIngredients.ingredients);
  const resolvedTags = await resolveTags(db, input.tags, now);
  recipe.tags = resolvedTags.map(({ id, name }) => ({ id, name }));
  const body = { recipe };
  const statements: D1PreparedStatement[] = [db.prepare(
    'INSERT INTO recipes (id, title, description, servings, prep_minutes, cook_minutes, source_type, source_name, source_url, image_key, notes, favorite, version, created_at, updated_at, deleted_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)'
  ).bind(recipe.id, recipe.title, recipe.description, recipe.servings, recipe.prep_minutes, recipe.cook_minutes, recipe.source_type, recipe.source_name, recipe.source_url, recipe.image_key, recipe.notes, recipe.favorite ? 1 : 0, recipe.version, recipe.created_at, recipe.updated_at, recipe.deleted_at)];
  statements.push(...recipeStatements(db, recipe, resolvedTags, resolvedIngredients.registrations));
  statements.push(db.prepare('INSERT INTO recipe_changes (recipe_id, recipe_version, changed_at, deleted) VALUES (?1, ?2, ?3, 0)').bind(recipe.id, recipe.version, now));
  statements.push(processedOperationStatement(db, context.operationId, context.method, context.path, fingerprint, 201, body, now));
  try {
    await db.batch(statements);
  } catch (cause) {
    const concurrentReplay = await replayOrReuse(db, context, fingerprint);
    if (concurrentReplay) return concurrentReplay;
    throw cause;
  }
  return { kind: 'success', status: 201, body, replayed: false };
}

function mergeRecipe(current: Recipe, input: RecipePatch | RecipePut, now: string, resolvedIngredients: ResolvedIngredient[] | undefined): Recipe {
  const { base_version: _baseVersion, ingredients: _ingredientInputs, instructions, tags, ...scalars } = input;
  return {
    ...current,
    ...scalars,
    servings: scalars.servings === undefined ? current.servings : scalars.servings ?? null,
    prep_minutes: scalars.prep_minutes === undefined ? current.prep_minutes : scalars.prep_minutes ?? null,
    cook_minutes: scalars.cook_minutes === undefined ? current.cook_minutes : scalars.cook_minutes ?? null,
    source_name: scalars.source_name === undefined ? current.source_name : scalars.source_name ?? null,
    source_url: scalars.source_url === undefined ? current.source_url : scalars.source_url ?? null,
    image_key: scalars.image_key === undefined ? current.image_key : scalars.image_key ?? null,
    version: current.version + 1,
    updated_at: now,
    ingredients: resolvedIngredients ?? current.ingredients,
    instructions: instructions?.map((entry: InstructionInput) => ({
      id: entry.id ?? crypto.randomUUID(), text: entry.text, timer_seconds: entry.timer_seconds ?? null,
    })) ?? current.instructions,
    tags: tags?.map((tag: TagInput) => ({ id: tag.id ?? crypto.randomUUID(), name: tag.name })) ?? current.tags,
  };
}

export async function updateRecipe(db: D1Database, recipeId: string, input: RecipePatch | RecipePut, context: MutationContext): Promise<MutationResult> {
  const fingerprint = await requestFingerprint(context.method, context.path, context.body);
  const replay = await replayOrReuse(db, context, fingerprint);
  if (replay) return replay;
  const current = await getRecipe(db, recipeId);
  if (!current) return { kind: 'not_found' };
  if (current.version !== input.base_version) return { kind: 'conflict', current };
  const now = new Date().toISOString();
  const resolvedIngredients = input.ingredients ? await resolveIngredients(db, input.ingredients) : undefined;
  const recipe = mergeRecipe(current, input, now, resolvedIngredients?.ingredients);
  const resolvedTags = await resolveTags(db, recipe.tags, now);
  recipe.tags = resolvedTags.map(({ id, name }) => ({ id, name }));
  const body = { recipe };
  const statements: D1PreparedStatement[] = [
    db.prepare('INSERT INTO mutation_guards (operation_id, valid) SELECT ?1, CASE WHEN EXISTS (SELECT 1 FROM recipes WHERE id = ?2 AND version = ?3 AND deleted_at IS NULL) THEN 1 ELSE 0 END').bind(context.operationId, recipeId, input.base_version),
    db.prepare('UPDATE recipes SET title = ?1, description = ?2, servings = ?3, prep_minutes = ?4, cook_minutes = ?5, source_type = ?6, source_name = ?7, source_url = ?8, image_key = ?9, notes = ?10, favorite = ?11, version = ?12, updated_at = ?13 WHERE id = ?14 AND version = ?15 AND deleted_at IS NULL').bind(recipe.title, recipe.description, recipe.servings, recipe.prep_minutes, recipe.cook_minutes, recipe.source_type, recipe.source_name, recipe.source_url, recipe.image_key, recipe.notes, recipe.favorite ? 1 : 0, recipe.version, now, recipeId, input.base_version),
    db.prepare('DELETE FROM ingredients WHERE recipe_id = ?1').bind(recipeId),
    db.prepare('DELETE FROM instructions WHERE recipe_id = ?1').bind(recipeId),
    db.prepare('DELETE FROM recipe_tags WHERE recipe_id = ?1').bind(recipeId),
    ...recipeStatements(db, recipe, resolvedTags, resolvedIngredients?.registrations ?? []),
    db.prepare('INSERT INTO recipe_changes (recipe_id, recipe_version, changed_at, deleted) VALUES (?1, ?2, ?3, 0)').bind(recipeId, recipe.version, now),
    processedOperationStatement(db, context.operationId, context.method, context.path, fingerprint, 200, body, now),
    db.prepare('DELETE FROM mutation_guards WHERE operation_id = ?1').bind(context.operationId),
  ];
  try {
    await db.batch(statements);
  } catch (cause) {
    const concurrentReplay = await replayOrReuse(db, context, fingerprint);
    if (concurrentReplay) return concurrentReplay;
    const latest = await getRecipe(db, recipeId);
    if (latest && latest.version !== input.base_version) return { kind: 'conflict', current: latest };
    throw cause;
  }
  return { kind: 'success', status: 200, body, replayed: false };
}

export async function deleteRecipe(db: D1Database, recipeId: string, baseVersion: number, context: MutationContext): Promise<MutationResult> {
  const fingerprint = await requestFingerprint(context.method, context.path, context.body);
  const replay = await replayOrReuse(db, context, fingerprint);
  if (replay) return replay;
  const current = await getRecipe(db, recipeId);
  if (!current) return { kind: 'not_found' };
  if (current.version !== baseVersion) return { kind: 'conflict', current };
  const now = new Date().toISOString();
  const body = { deleted: true, id: recipeId, version: current.version + 1, deleted_at: now };
  const statements = [
    db.prepare('INSERT INTO mutation_guards (operation_id, valid) SELECT ?1, CASE WHEN EXISTS (SELECT 1 FROM recipes WHERE id = ?2 AND version = ?3 AND deleted_at IS NULL) THEN 1 ELSE 0 END').bind(context.operationId, recipeId, baseVersion),
    db.prepare('UPDATE recipes SET deleted_at = ?1, updated_at = ?1, version = version + 1 WHERE id = ?2 AND version = ?3 AND deleted_at IS NULL').bind(now, recipeId, baseVersion),
    db.prepare('INSERT INTO recipe_changes (recipe_id, recipe_version, changed_at, deleted) VALUES (?1, ?2, ?3, 1)').bind(recipeId, current.version + 1, now),
    processedOperationStatement(db, context.operationId, context.method, context.path, fingerprint, 200, body, now),
    db.prepare('DELETE FROM mutation_guards WHERE operation_id = ?1').bind(context.operationId),
  ];
  try {
    await db.batch(statements);
  } catch (cause) {
    const concurrentReplay = await replayOrReuse(db, context, fingerprint);
    if (concurrentReplay) return concurrentReplay;
    const latest = await getRecipe(db, recipeId, true);
    if (latest) return { kind: 'conflict', current: latest };
    throw cause;
  }
  return { kind: 'success', status: 200, body, replayed: false };
}

interface ChangeRow {
  sequence: number;
  recipe_id: string;
  recipe_version: number;
  changed_at: string;
  deleted: number;
}

export async function recipeChanges(db: D1Database, cursor: number, limit: number): Promise<{ changes: unknown[]; next_cursor: number; has_more: boolean }> {
  const result = await db.prepare('SELECT sequence, recipe_id, recipe_version, changed_at, deleted FROM recipe_changes WHERE sequence > ?1 ORDER BY sequence LIMIT ?2').bind(cursor, limit).all<ChangeRow>();
  const latestByRecipe = new Map<string, ChangeRow>();
  for (const change of result.results) latestByRecipe.set(change.recipe_id, change);
  const changes = await Promise.all(Array.from(latestByRecipe.values()).map(async (change) => ({
    sequence: change.sequence,
    recipe_id: change.recipe_id,
    version: change.recipe_version,
    changed_at: change.changed_at,
    deleted: change.deleted === 1,
    recipe: change.deleted === 1 ? null : await getRecipe(db, change.recipe_id),
  })));
  return { changes, next_cursor: result.results.at(-1)?.sequence ?? cursor, has_more: result.results.length === limit };
}
