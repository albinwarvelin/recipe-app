import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError, createRecipe, getChanges, getRecipes, removeRecipe, replaceRecipe, setFavorite, type Ingredient, type Instruction, type Recipe, type RecipeDraft } from '../api/recipes';

interface HomePageProps { email: string; }

const emptyDraft: RecipeDraft = {
  title: '', description: '', servings: null, prep_minutes: null, cook_minutes: null,
  source_type: 'personal', source_name: null, source_url: null, image_key: null,
  notes: '', favorite: false, ingredients: [], instructions: [], tags: [],
};

function draftFromRecipe(recipe: Recipe): RecipeDraft {
  const { id: _id, version: _version, created_at: _created, updated_at: _updated, deleted_at: _deleted, ...draft } = recipe;
  return structuredClone(draft);
}

function optionalNumber(value: string): number | null { return value === '' ? null : Number(value); }

function RecipeEditor({ recipe, onCancel, onSaved }: { recipe: Recipe | null; onCancel: () => void; onSaved: (recipe: Recipe) => void }) {
  const [draft, setDraft] = useState<RecipeDraft>(() => recipe ? draftFromRecipe(recipe) : structuredClone(emptyDraft));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();

  function updateIngredient(index: number, patch: Partial<Ingredient>) {
    setDraft((current) => ({ ...current, ingredients: current.ingredients.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }));
  }
  function updateInstruction(index: number, patch: Partial<Instruction>) {
    setDraft((current) => ({ ...current, instructions: current.instructions.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setMessage(undefined);
    try { onSaved(recipe ? await replaceRecipe(recipe, draft) : await createRecipe(draft)); }
    catch (cause) {
      if (cause instanceof ApiError && cause.current) setMessage(`Version conflict: the server is on version ${cause.current.version}. Close the editor, refresh, and reapply your change.`);
      else setMessage(cause instanceof Error ? cause.message : 'The recipe could not be saved.');
    } finally { setSaving(false); }
  }

  return <section className="editor-panel" aria-labelledby="editor-title">
    <div className="section-heading"><div><p className="eyebrow">API editor</p><h2 id="editor-title">{recipe ? 'Edit recipe' : 'New recipe'}</h2></div><button className="text-button" type="button" onClick={onCancel}>Close</button></div>
    <form onSubmit={(event) => void submit(event)}>
      <label>Title<input required maxLength={200} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
      <label>Description<textarea rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
      <div className="field-grid">
        <label>Servings<input type="number" min="1" value={draft.servings ?? ''} onChange={(event) => setDraft({ ...draft, servings: optionalNumber(event.target.value) })} /></label>
        <label>Prep minutes<input type="number" min="0" value={draft.prep_minutes ?? ''} onChange={(event) => setDraft({ ...draft, prep_minutes: optionalNumber(event.target.value) })} /></label>
        <label>Cook minutes<input type="number" min="0" value={draft.cook_minutes ?? ''} onChange={(event) => setDraft({ ...draft, cook_minutes: optionalNumber(event.target.value) })} /></label>
      </div>
      <label>Tags <span className="label-note">comma separated</span><input value={draft.tags.map((tag) => tag.name).join(', ')} onChange={(event) => setDraft({ ...draft, tags: event.target.value.split(',').map((name) => name.trim()).filter(Boolean).map((name) => ({ name })) })} /></label>
      <fieldset><legend>Ingredients</legend>
        {draft.ingredients.map((ingredient, index) => <div className="ingredient-row" key={ingredient.id ?? index}>
          <input aria-label={`Ingredient ${index + 1} amount`} placeholder="Amount" value={ingredient.amount ?? ''} onChange={(event) => updateIngredient(index, { amount: event.target.value || null })} />
          <input aria-label={`Ingredient ${index + 1} unit`} placeholder="Unit" value={ingredient.unit ?? ''} onChange={(event) => updateIngredient(index, { unit: event.target.value || null })} />
          <input required aria-label={`Ingredient ${index + 1} name`} placeholder="Ingredient" value={ingredient.name} onChange={(event) => updateIngredient(index, { name: event.target.value })} />
          <button className="icon-button" type="button" onClick={() => setDraft({ ...draft, ingredients: draft.ingredients.filter((_, itemIndex) => itemIndex !== index) })}>Remove</button>
        </div>)}
        <button className="secondary-button" type="button" onClick={() => setDraft({ ...draft, ingredients: [...draft.ingredients, { amount: null, unit: null, name: '', group_name: null }] })}>Add ingredient</button>
      </fieldset>
      <fieldset><legend>Instructions</legend>
        {draft.instructions.map((instruction, index) => <div className="instruction-row" key={instruction.id ?? index}>
          <span className="step-number">{index + 1}</span>
          <textarea required rows={2} aria-label={`Instruction ${index + 1}`} value={instruction.text} onChange={(event) => updateInstruction(index, { text: event.target.value })} />
          <input type="number" min="0" aria-label={`Instruction ${index + 1} timer seconds`} placeholder="Timer sec" value={instruction.timer_seconds ?? ''} onChange={(event) => updateInstruction(index, { timer_seconds: optionalNumber(event.target.value) })} />
          <button className="icon-button" type="button" onClick={() => setDraft({ ...draft, instructions: draft.instructions.filter((_, itemIndex) => itemIndex !== index) })}>Remove</button>
        </div>)}
        <button className="secondary-button" type="button" onClick={() => setDraft({ ...draft, instructions: [...draft.instructions, { text: '', timer_seconds: null }] })}>Add instruction</button>
      </fieldset>
      <label>Notes<textarea rows={4} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
      <label className="checkbox-label"><input type="checkbox" checked={draft.favorite} onChange={(event) => setDraft({ ...draft, favorite: event.target.checked })} /> Favorite</label>
      {message && <p className="error-message" role="alert">{message}</p>}
      <div className="form-actions"><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save recipe'}</button><button className="secondary-button" type="button" onClick={onCancel}>Cancel</button></div>
    </form>
  </section>;
}

export function HomePage({ email }: HomePageProps) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string>();
  const [editing, setEditing] = useState<Recipe | null | undefined>();
  const [cursor, setCursor] = useState(0);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setMessage(undefined);
    try { setRecipes(await getRecipes(signal)); }
    catch (cause) { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setMessage(cause instanceof Error ? cause.message : 'Recipes could not be loaded.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal); return () => controller.abort(); }, [refresh]);
  async function toggleFavorite(recipe: Recipe) {
    try { const updated = await setFavorite(recipe, !recipe.favorite); setRecipes((current) => current.map((entry) => entry.id === updated.id ? updated : entry)); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Favorite could not be updated.'); }
  }
  async function deleteSelected(recipe: Recipe) {
    if (!window.confirm(`Delete “${recipe.title}”?`)) return;
    try { await removeRecipe(recipe); setRecipes((current) => current.filter((entry) => entry.id !== recipe.id)); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Recipe could not be deleted.'); }
  }
  async function checkChanges() {
    try { const page = await getChanges(cursor); setCursor(page.next_cursor); setMessage(page.changes.length ? `${page.changes.length} changed recipe(s) received; library refreshed.` : `No changes after cursor ${cursor}.`); if (page.changes.length) await refresh(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Changes could not be loaded.'); }
  }

  return <div className="app-shell">
    <header className="navigation-bar"><div><p className="eyebrow">Private kitchen</p><h1>Recipes</h1></div><div className="header-actions"><span className="sync-indicator">Secure</span><a className="text-button" href="/cdn-cgi/access/logout">Sign out</a></div></header>
    <main className="page-content">
      <section className="tester-bar" aria-label="API testing controls"><div><strong>{email}</strong><span>Direct API tester · change cursor {cursor}</span></div><div className="compact-actions"><button className="secondary-button" type="button" onClick={() => void checkChanges()}>Check changes</button><button className="primary-button" type="button" onClick={() => setEditing(null)}>New recipe</button></div></section>
      {message && <p className="status-message" role="status">{message}</p>}
      {editing !== undefined && <RecipeEditor recipe={editing} onCancel={() => setEditing(undefined)} onSaved={(saved) => { setRecipes((current) => [saved, ...current.filter((entry) => entry.id !== saved.id)]); setEditing(undefined); }} />}
      {loading ? <p className="loading-message">Loading recipes…</p> : recipes.length === 0 ? <section className="empty-state"><div className="empty-state-icon">+</div><h2>Your library is empty.</h2><p>Create a recipe to exercise the protected API.</p><button className="primary-button" type="button" onClick={() => setEditing(null)}>Create first recipe</button></section> :
        <section className="recipe-grid" aria-label="Recipe library">{recipes.map((recipe) => <article className="recipe-card" key={recipe.id}>
          <div className="recipe-card-heading"><div><p className="eyebrow">v{recipe.version} · {recipe.source_type}</p><h2>{recipe.title}</h2></div><button className={`favorite-button ${recipe.favorite ? 'is-favorite' : ''}`} type="button" aria-label={`${recipe.favorite ? 'Remove' : 'Add'} favorite`} onClick={() => void toggleFavorite(recipe)}>★</button></div>
          {recipe.description && <p>{recipe.description}</p>}
          <div className="metadata"><span>{recipe.servings ?? '—'} servings</span><span>{(recipe.prep_minutes ?? 0) + (recipe.cook_minutes ?? 0)} min</span><span>{recipe.ingredients.length} ingredients</span></div>
          {recipe.tags.length > 0 && <div className="tag-list">{recipe.tags.map((tag) => <span key={tag.id ?? tag.name}>{tag.name}</span>)}</div>}
          <div className="card-actions"><button className="secondary-button" type="button" onClick={() => setEditing(recipe)}>Edit</button><button className="danger-button" type="button" onClick={() => void deleteSelected(recipe)}>Delete</button></div>
        </article>)}</section>}
    </main>
  </div>;
}
