import { useEffect, useMemo, useState } from 'react';
import type { RecipeDraft } from '../api/recipes';
import { ConflictDialog } from '../components/ConflictDialog';
import { RecipeCard } from '../components/RecipeCard';
import { RecipeDetail } from '../components/RecipeDetail';
import { RecipeEditor } from '../components/RecipeEditor';
import { SettingsView } from '../components/SettingsView';
import { SyncIndicator } from '../components/SyncIndicator';
import type { LocalRecipe, RecipeConflict } from '../data/db';
import { deleteLocalRecipe, saveLocalRecipe, setLocalFavorite, type CoverChange } from '../data/local-recipes';
import { useConflicts, useRecipes, useSyncState } from '../hooks/useLocalData';
import { installSyncTriggers, resolveConflictKeepLocal, resolveConflictKeepServer, syncNow } from '../sync/coordinator';

type View = { kind: 'library' } | { kind: 'detail'; recipeId: string } | { kind: 'editor'; recipe: LocalRecipe | null; conflict?: RecipeConflict } | { kind: 'settings' };

export function HomePage({ email }: { email?: string }) {
  const recipes = useRecipes();
  const conflicts = useConflicts();
  const sync = useSyncState();
  const [view, setView] = useState<View>({ kind: 'library' });
  const [query, setQuery] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => installSyncTriggers(), []);
  const selected = view.kind === 'detail' ? recipes.find((recipe) => recipe.id === view.recipeId) : undefined;
  useEffect(() => { if (view.kind === 'detail' && !selected) setView({ kind: 'library' }); }, [selected, view.kind]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return recipes.filter((recipe) => (!favoritesOnly || recipe.favorite) && (!term || [recipe.title, recipe.description, ...recipe.tags.map((tag) => tag.name), ...recipe.ingredients.map((item) => item.name)].some((value) => value.toLowerCase().includes(term))));
  }, [favoritesOnly, query, recipes]);

  async function save(recipe: LocalRecipe | null, draft: RecipeDraft, cover: CoverChange) {
    const saved = await saveLocalRecipe(recipe, draft, cover);
    setView({ kind: 'detail', recipeId: saved.id });
    void syncNow();
  }
  async function remove(recipe: LocalRecipe) {
    if (!window.confirm(`Delete “${recipe.title}”? The deletion will synchronize across devices.`)) return;
    await deleteLocalRecipe(recipe); setView({ kind: 'library' }); void syncNow();
  }

  if (view.kind === 'settings') return <SettingsView email={email} sync={sync} onBack={() => setView({ kind: 'library' })} onCleared={() => setView({ kind: 'library' })} />;
  if (view.kind === 'editor') return <RecipeEditor recipe={view.recipe} title={view.conflict ? 'Merge recipe' : undefined} onCancel={() => setView(view.recipe ? { kind: 'detail', recipeId: view.recipe.id } : { kind: 'library' })} onSave={async (draft, cover) => {
    if (view.conflict) {
      if (cover.kind !== 'keep') throw new Error('Resolve the text conflict first; the existing cover is preserved.');
      await resolveConflictKeepLocal(view.conflict, draft); setView({ kind: 'detail', recipeId: view.conflict.entity_id });
    } else await save(view.recipe, draft, cover);
  }} />;
  if (view.kind === 'detail' && selected) return <><RecipeDetail recipe={selected} onBack={() => setView({ kind: 'library' })} onEdit={() => setView({ kind: 'editor', recipe: selected })} onDelete={() => void remove(selected)} />{conflicts[0] && <ConflictDialog conflict={conflicts[0]} onKeepLocal={() => void resolveConflictKeepLocal(conflicts[0])} onKeepServer={() => void resolveConflictKeepServer(conflicts[0])} onMerge={() => setView({ kind: 'editor', recipe: conflicts[0].local_recipe, conflict: conflicts[0] })} />}</>;

  return <div className="app-shell">
    <header className="navigation-bar"><div><p className="eyebrow">Private kitchen</p><h1>Recipes</h1></div><div className="header-actions"><SyncIndicator state={sync} /><div className="menu-wrap"><button className="menu-button" type="button" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>•••</button>{menuOpen && <div className="app-menu"><button type="button" onClick={() => { setMenuOpen(false); void syncNow(); }}>Sync now</button><button type="button" onClick={() => { setMenuOpen(false); setView({ kind: 'settings' }); }}>Settings</button><a href="/cdn-cgi/access/logout">Sign out</a></div>}</div></div></header>
    <main className="library-content">
      {(sync.phase === 'offline' || sync.phase === 'auth-required' || sync.phase === 'error') && <div className={`offline-banner ${sync.phase}`}><span>{sync.phase === 'offline' ? 'Offline — changes are saved on this device' : sync.message ?? 'Synchronization is unavailable'}</span>{sync.phase === 'auth-required' && <button type="button" onClick={() => window.location.assign('/')}>Sign in</button>}{sync.phase === 'error' && <button type="button" onClick={() => void syncNow()}>Try again</button>}</div>}
      <section className="library-controls"><label className="search-field"><span aria-hidden="true">⌕</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search recipes or ingredients" aria-label="Search recipes" /></label><div className="filter-row"><button className={!favoritesOnly ? 'active' : ''} type="button" onClick={() => setFavoritesOnly(false)}>All recipes</button><button className={favoritesOnly ? 'active' : ''} type="button" onClick={() => setFavoritesOnly(true)}>Favorites</button></div></section>
      {filtered.length ? <section className="recipe-grid" aria-label="Recipe library">{filtered.map((recipe) => <RecipeCard key={recipe.id} recipe={recipe} onOpen={() => setView({ kind: 'detail', recipeId: recipe.id })} onFavorite={() => { void setLocalFavorite(recipe, !recipe.favorite).then(() => syncNow()); }} />)}</section> : <section className="empty-state"><div className="empty-state-icon" aria-hidden="true">✦</div><h2>{recipes.length ? 'No recipes match.' : 'Your kitchen starts here.'}</h2><p>{recipes.length ? 'Try another search or filter.' : 'Add a recipe with a cover photo, then it will remain available even when you are offline.'}</p>{!recipes.length && <button className="primary-button" type="button" onClick={() => setView({ kind: 'editor', recipe: null })}>Create first recipe</button>}</section>}
    </main>
    <button className="floating-add" type="button" aria-label="Create recipe" onClick={() => setView({ kind: 'editor', recipe: null })}>+</button>
    {conflicts[0] && <ConflictDialog conflict={conflicts[0]} onKeepLocal={() => void resolveConflictKeepLocal(conflicts[0])} onKeepServer={() => void resolveConflictKeepServer(conflicts[0])} onMerge={() => setView({ kind: 'editor', recipe: conflicts[0].local_recipe, conflict: conflicts[0] })} />}
  </div>;
}
