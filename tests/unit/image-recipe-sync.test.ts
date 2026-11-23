import 'fake-indexeddb/auto';
import { syntheticRecipeImports } from '../fixtures/recipe-imports';
import { parseRecipeImport } from '../../shared/recipe-import';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, clearLocalData } from '../../src/data/db';
import { saveLocalRecipe, draftFromLocalRecipe } from '../../src/data/local-recipes';
import { syncNow, syncSnapshot } from '../../src/sync/coordinator';
import { retrySyncProblem, syncProblems } from '../../src/sync/problems';
import type { Recipe, RecipeDraft, SyncOperation } from '../../src/api/recipes';
import { syncRequestSchema } from '../../worker/validation/recipes';

const draft: RecipeDraft = {
  title: 'Testrecept', description: '', servings: 4, prep_minutes: 10, cook_minutes: 20,
  source_type: 'ai', source_name: null, source_url: null, image_key: null, notes: '', favorite: false,
  ingredients: [{ name: 'Testingrediens', amount: '1', unit: 'g', group_name: null }],
  instructions: [{ text: 'Teststeg.', timer_seconds: 60 }], tags: [{ name: 'Testtagg' }],
};
let imageStatus = 422;
let coverStatus = 200;
let uploads = 0;
let server = new Map<string, Recipe>();
let changes: Array<{ sequence: number; recipe_id: string; version: number; changed_at: string; deleted: boolean; recipe: Recipe }> = [];
let replies = new Map<string, unknown>();
let loseNextRecipeReply = false;
let loseCoverReply = false;
let requestBodies = new Map<string, string>();

async function withImage(recipeDraft = draft) {
  return saveLocalRecipe(null, recipeDraft, { kind: 'replace', image: {
    id: crypto.randomUUID(), full: new Blob(['full'], { type: 'image/webp' }), thumbnail: new Blob(['thumb'], { type: 'image/webp' }), width: 100, height: 100,
  } });
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.stubGlobal('navigator', { onLine: true });
  imageStatus = 422; coverStatus = 200; uploads = 0; server = new Map(); changes = []; replies = new Map(); loseNextRecipeReply = false; loseCoverReply = false; requestBodies = new Map();
  await clearLocalData();
  vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
    if (path.startsWith('/api/images/')) {
      if (init?.method === 'DELETE') return Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
      uploads++;
      return imageStatus >= 400 ? Response.json({ error: { code: 'INVALID_IMAGE', requestId: 'image-request-123' } }, { status: imageStatus })
        : Response.json({ image: { id: path.split('/').at(-1), content_type: 'image/webp' } });
    }
    if (path === '/api/sync') {
      const body = JSON.parse(String(init?.body));
      expect(syncRequestSchema.safeParse(body).success).toBe(true);
      const results = body.operations.map((op: SyncOperation) => {
        if (replies.has(op.operation_id)) { expect(JSON.stringify(op)).toBe(requestBodies.get(op.operation_id)); return replies.get(op.operation_id); }
        requestBodies.set(op.operation_id, JSON.stringify(op));
        if (op.type === 'update' && op.payload.image_key && coverStatus >= 400) return { operation_id: op.operation_id, status: coverStatus, body: { error: { code: 'IMAGE_NOT_FOUND' } } };
        const id = op.type === 'create' ? op.payload.id : op.entity_id;
        const current = server.get(id);
        if (op.type !== 'create' && current?.version !== (op.type === 'delete' ? op.base_version : op.payload.base_version)) {
          return { operation_id: op.operation_id, status: 409, body: { error: { code: 'VERSION_CONFLICT', details: { current } } } };
        }
        const recipe = { ...current, ...(op.type === 'delete' ? {} : op.payload), id, version: (current?.version ?? 0) + 1, created_at: current?.created_at ?? new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: op.type === 'delete' ? new Date().toISOString() : null } as Recipe;
        delete (recipe as Recipe & { base_version?: number }).base_version;
        server.set(id, recipe);
        changes.push({ sequence: changes.length + 1, recipe_id: id, version: recipe.version, changed_at: recipe.updated_at, deleted: !!recipe.deleted_at, recipe });
        const result = { operation_id: op.operation_id, status: 200, body: { recipe } }; replies.set(op.operation_id, result); return result;
      });
      if (loseNextRecipeReply) { loseNextRecipeReply = false; throw new TypeError('Connection lost after server commit'); }
      if (loseCoverReply && body.operations[0].type === 'update' && body.operations[0].payload.image_key) { loseCoverReply = false; throw new TypeError('Cover reply lost after server commit'); }
      return Response.json({ results });
    }
    if (path.startsWith('/api/sync/changes')) {
      const cursor = Number(new URL(path, 'https://test').searchParams.get('cursor'));
      return Response.json({ changes: changes.filter((item) => item.sequence > cursor), next_cursor: changes.length, has_more: false });
    }
    if (path.startsWith('/api/planning/changes')) return Response.json({ changes: [], next_cursor: 0, has_more: false });
    if (path === '/api/ingredients') return Response.json({ ingredients: [] });
    if (path === '/api/tags') return Response.json({ tags: [] });
    throw new Error(`Unexpected request: ${path}`);
  }));
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('recipes with deferred covers', () => {
  it.each(syntheticRecipeImports)('keeps an import with %s available after a cover rejection and reopening storage', async (_name, raw) => {
    const imported = parseRecipeImport(raw).draft;
    const local = await withImage(imported); await syncNow();
    db.close(); await db.open();
    expect(await db.recipes.get(local.id)).toMatchObject({ title: imported.title, notes: imported.notes, image_key: local.image_key });
    expect(server.get(local.id)).toMatchObject({ title: imported.title, image_key: null });
    expect(server.get(local.id)?.instructions).toHaveLength(imported.instructions.length);
  });
  it('syncs recipe text after image rejection, retains local cover, and attaches it after an explicit retry', async () => {
    const local = await withImage();
    await syncNow();
    expect(server.get(local.id)).toMatchObject({ title: 'Testrecept', image_key: null });
    expect(await db.recipes.get(local.id)).toMatchObject({ image_key: local.image_key });
    expect(await db.conflicts.count()).toBe(0);
    expect(await syncProblems()).toContainEqual(expect.objectContaining({ recipeId: local.id, last_error_code: 'INVALID_IMAGE', last_request_id: 'image-request-123' }));
    await syncNow(); expect(uploads).toBe(1);
    const upload = await db.outbox.where('type').equals('image-upload').first();
    imageStatus = 200;
    await retrySyncProblem('recipe', upload!.operation_id); await syncNow();
    expect(server.get(local.id)).toMatchObject({ image_key: local.image_key, version: 2 });
    expect(await db.outbox.count()).toBe(0);
    expect(await db.recipes.get(local.id)).toMatchObject({ image_key: local.image_key, sync_status: 'synced' });
    db.close(); await db.open(); expect(await db.recipes.get(local.id)).toBeDefined();
  });

  it('keeps later text edits independent of a failed cover', async () => {
    const local = await withImage(); await syncNow();
    const saved = (await db.recipes.get(local.id))!;
    await saveLocalRecipe(saved, { ...draftFromLocalRecipe(saved), title: 'Ny titel' }, { kind: 'keep' });
    await syncNow();
    expect(server.get(local.id)).toMatchObject({ title: 'Ny titel', image_key: null, version: 2 });
    expect(await db.recipes.get(local.id)).toMatchObject({ title: 'Ny titel', image_key: local.image_key });
  });

  it('lets the owner continue without a failed image and clears its blocked work', async () => {
    const local = await withImage(); await syncNow();
    const saved = (await db.recipes.get(local.id))!;
    await saveLocalRecipe(saved, draftFromLocalRecipe(saved), { kind: 'remove' }); await syncNow();
    expect(await db.outbox.count()).toBe(0);
    expect(await db.recipes.get(local.id)).toMatchObject({ image_key: null, sync_status: 'synced' });
  });

  it('continues other recipe uploads after a temporary image failure', async () => {
    imageStatus = 503;
    const first = await withImage(); const second = await saveLocalRecipe(null, { ...draft, title: 'Soppa' }, { kind: 'keep' });
    await syncNow();
    expect(server.has(first.id)).toBe(true); expect(server.has(second.id)).toBe(true);
    expect(syncSnapshot().phase).toBe('error');
  });

  it('retries an uncertain create unchanged before a subsequent edit', async () => {
    const local = await saveLocalRecipe(null, draft, { kind: 'keep' });
    loseNextRecipeReply = true; await syncNow();
    const first = (await db.outbox.toArray())[0];
    await saveLocalRecipe((await db.recipes.get(local.id))!, { ...draftFromLocalRecipe(local), title: 'Senare ändring' }, { kind: 'keep' });
    expect((await db.outbox.get(first.sequence!))?.payload?.title).toBe('Testrecept');
    await retrySyncProblem('recipe', first.operation_id); await syncNow();
    expect(server.size).toBe(1); expect(server.get(local.id)).toMatchObject({ title: 'Senare ändring', version: 2 });
  });

  it('recovers a lost cover acknowledgement without overwriting a later edit', async () => {
    imageStatus = 200; loseCoverReply = true;
    const local = await withImage(); await syncNow();
    const cover = (await db.outbox.where('type').equals('recipe-cover').first())!;
    const current = (await db.recipes.get(local.id))!;
    await saveLocalRecipe(current, { ...draftFromLocalRecipe(current), title: 'Efter bilden' }, { kind: 'keep' });
    await retrySyncProblem('recipe', cover.operation_id); await syncNow();
    expect(server.get(local.id)).toMatchObject({ title: 'Efter bilden', image_key: local.image_key, version: 3 });
    expect(await db.outbox.count()).toBe(0); expect(await db.conflicts.count()).toBe(0);
  });

  it('keeps text edits independent of a rejected cover attachment and retries it against the current version', async () => {
    imageStatus = 200; coverStatus = 422;
    const local = await withImage(); await syncNow();
    const current = (await db.recipes.get(local.id))!;
    await saveLocalRecipe(current, { ...draftFromLocalRecipe(current), title: 'Text utan bild' }, { kind: 'keep' }); await syncNow();
    expect(server.get(local.id)).toMatchObject({ title: 'Text utan bild', image_key: null, version: 2 });
    const cover = (await db.outbox.where('type').equals('recipe-cover').first())!;
    coverStatus = 200; await retrySyncProblem('recipe', cover.operation_id); await syncNow();
    expect(server.get(local.id)).toMatchObject({ title: 'Text utan bild', image_key: local.image_key, version: 3 });
    expect(await db.outbox.count()).toBe(0);
  });
});
