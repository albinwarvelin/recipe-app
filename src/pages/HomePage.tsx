import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import type { RecipeDraft } from '../api/recipes';
import { ConflictDialog } from '../components/ConflictDialog';
import { ConflictResolution } from '../components/ConflictResolution';
import { ingredientLabel } from '../components/IngredientCombobox';
import { CheckIcon, ChevronDownIcon, CloseIcon, MoreIcon, PlusIcon, SearchIcon, StarIcon } from '../components/Icons';
import { RecipeCard } from '../components/RecipeCard';
import { RecipeDetail } from '../components/RecipeDetail';
import { RecipeEditor } from '../components/RecipeEditor';
import { SettingsView } from '../components/SettingsView';
import { SyncIndicator } from '../components/SyncIndicator';
import type { LocalIngredientCatalog, LocalRecipe, LocalTag, RecipeConflict } from '../data/db';
import { deleteLocalRecipe, saveLocalRecipe, setLocalFavorite, type CoverChange } from '../data/local-recipes';
import { normalizeSearchValue } from '../data/normalize';
import { useConflicts, useIngredientCatalog, useRecipes, useSyncState, useTags, type LocalQueryState } from '../hooks/useLocalData';
import { installSyncTriggers, resolveConflictKeepLocal, resolveConflictKeepServer, syncNow } from '../sync/coordinator';

type MatchMode = 'any' | 'all';
type SortMode = 'updated' | 'title' | 'time';
type OpenPopover = 'app' | 'ingredients' | 'tags' | 'time' | 'sort' | null;

function setValues(params: URLSearchParams, key: string, values: string[]): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete(key);
  for (const value of values) next.append(key, value);
  return next;
}

function Library({ recipes, recipesStatus, catalog, tags, email }: { recipes: LocalRecipe[]; recipesStatus: LocalQueryState<LocalRecipe[]>['status']; catalog: LocalIngredientCatalog[]; tags: LocalTag[]; email?: string }) {
  const sync = useSyncState();
  const [params, setParams] = useSearchParams();
  const [openPopover, setOpenPopover] = useState<OpenPopover>(null);
  const [ingredientSearch, setIngredientSearch] = useState('');
  const ingredientInput = useRef<HTMLInputElement>(null);
  const query = params.get('q') ?? '';
  const ingredientIds = params.getAll('ingredient');
  const tagIds = params.getAll('tag');
  const ingredientMode: MatchMode = params.get('ingredientMode') === 'all' ? 'all' : 'any';
  const tagMode: MatchMode = params.get('tagMode') === 'all' ? 'all' : 'any';
  const favoritesOnly = params.get('favorite') === '1';
  const maxTime = Number(params.get('maxTime') ?? 0);
  const sort = (['updated', 'title', 'time'].includes(params.get('sort') ?? '') ? params.get('sort') : 'updated') as SortMode;
  const catalogById = useMemo(() => new Map(catalog.map((entry) => [entry.id, entry])), [catalog]);
  const tagsById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags]);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('[data-popover-root]')) { setOpenPopover(null); setIngredientSearch(''); }
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpenPopover(null); setIngredientSearch(''); } };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  function updateParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true, preventScrollReset: true });
  }
  function toggleList(key: string, current: string[], value: string) {
    const nextValues = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
    setParams(setValues(params, key, nextValues), { replace: true, preventScrollReset: true });
  }

  const filtered = useMemo(() => {
    const term = normalizeSearchValue(query);
    const list = recipes.filter((recipe) => {
      if (favoritesOnly && !recipe.favorite) return false;
      const totalTime = (recipe.prep_minutes ?? 0) + (recipe.cook_minutes ?? 0);
      if (maxTime > 0 && totalTime > maxTime) return false;
      if (term && ![recipe.title, recipe.description, ...recipe.tags.map((tag) => tag.name), ...recipe.ingredients.map((item) => item.name)].some((value) => normalizeSearchValue(value).includes(term))) return false;
      const recipeIngredientIds = new Set(recipe.ingredients.flatMap((item) => item.catalog_id ? [item.catalog_id] : []));
      const ingredientMatches = ingredientIds.map((id) => recipeIngredientIds.has(id));
      if (ingredientMatches.length && !(ingredientMode === 'all' ? ingredientMatches.every(Boolean) : ingredientMatches.some(Boolean))) return false;
      const recipeTagIds = new Set(recipe.tags.flatMap((tag) => tag.id ? [tag.id] : []));
      const tagMatches = tagIds.map((id) => recipeTagIds.has(id));
      if (tagMatches.length && !(tagMode === 'all' ? tagMatches.every(Boolean) : tagMatches.some(Boolean))) return false;
      return true;
    });
    return list.sort((left, right) => sort === 'title'
      ? left.title.localeCompare(right.title, 'sv')
      : sort === 'time'
        ? ((left.prep_minutes ?? 0) + (left.cook_minutes ?? 0)) - ((right.prep_minutes ?? 0) + (right.cook_minutes ?? 0))
        : right.updated_at.localeCompare(left.updated_at));
  }, [favoritesOnly, ingredientIds.join('|'), ingredientMode, maxTime, query, recipes, sort, tagIds.join('|'), tagMode]);

  const ingredientAlternatives = useMemo(() => {
    const term = normalizeSearchValue(ingredientSearch);
    return catalog.map((entry) => {
      const names = entry.names.map((name) => normalizeSearchValue(name.normalized_name));
      const score = !term ? 1 : names.some((name) => name.startsWith(term)) ? 0 : names.some((name) => name.includes(term)) ? 1 : 2;
      return { entry, score };
    }).filter(({ score }) => score < 2)
      .sort((left, right) => Number(!ingredientIds.includes(left.entry.id)) - Number(!ingredientIds.includes(right.entry.id)) || left.score - right.score || ingredientLabel(left.entry).localeCompare(ingredientLabel(right.entry), 'sv'))
      .slice(0, 40);
  }, [catalog, ingredientIds.join('|'), ingredientSearch]);

  const timeLabel = maxTime ? `Högst ${maxTime} min` : 'Alla';
  const sortLabel = sort === 'title' ? 'Namn' : sort === 'time' ? 'Kortast tid' : 'Senast ändrad';
  const togglePopover = (popover: Exclude<OpenPopover, null>) => {
    const next = openPopover === popover ? null : popover;
    setOpenPopover(next);
    if (next !== 'ingredients') setIngredientSearch('');
  };

  const activeFilters = [
    ...(query ? [{ key: 'q', label: `Sökning: ${query}`, remove: () => updateParam('q', null) }] : []),
    ...(favoritesOnly ? [{ key: 'favorite', label: 'Favoriter', remove: () => updateParam('favorite', null) }] : []),
    ...(maxTime ? [{ key: 'maxTime', label: `Högst ${maxTime} min`, remove: () => updateParam('maxTime', null) }] : []),
    ...ingredientIds.map((id) => ({ key: `ingredient-${id}`, label: ingredientLabel(catalogById.get(id)!), remove: () => toggleList('ingredient', ingredientIds, id) })).filter((item) => item.label),
    ...tagIds.map((id) => ({ key: `tag-${id}`, label: tagsById.get(id)?.name ?? '', remove: () => toggleList('tag', tagIds, id) })).filter((item) => item.label),
  ];

  return <div className="app-shell">
    <header className="navigation-bar">
      <div className="navigation-bar-inner page-container">
        <div><p className="text-eyebrow">Privat kök</p><h1 className="heading-1">Recept</h1></div>
        <div className="header-actions"><SyncIndicator state={sync} /><div className="menu-wrap" data-popover-root><button className="menu-button" type="button" aria-label="Öppna meny" aria-expanded={openPopover === 'app'} onClick={() => togglePopover('app')}><MoreIcon /></button>{openPopover === 'app' && <div className="app-menu"><button type="button" onClick={() => { setOpenPopover(null); void syncNow(); }}>Synkronisera nu</button><Link to="/settings" onClick={() => setOpenPopover(null)}>Inställningar</Link><a href="/cdn-cgi/access/logout">Logga ut{email ? ` (${email})` : ''}</a></div>}</div></div>
      </div>
    </header>
    <main className="library-content page-container">
      {(sync.phase === 'offline' || sync.phase === 'auth-required' || sync.phase === 'error') && <div className={`offline-banner ${sync.phase}`}><span>{sync.phase === 'offline' ? 'Offline — ändringar sparas på den här enheten.' : sync.message ?? 'Synkronisering är inte tillgänglig.'}</span>{sync.phase === 'auth-required' && <button type="button" onClick={() => window.location.assign('/')}>Logga in</button>}{sync.phase === 'error' && <button type="button" onClick={() => void syncNow()}>Försök igen</button>}</div>}
      <section className="library-controls">
        <label className="search-field"><SearchIcon /><input type="search" value={query} onChange={(event) => updateParam('q', event.target.value)} placeholder="Sök bland recept, ingredienser och taggar" aria-label="Sök recept" /></label>
        <div className="filter-toolbar">
          <div className="filter-control ingredient-filter" data-popover-root>
            <div className={`ingredient-filter-trigger ${openPopover === 'ingredients' ? 'is-open' : ''}`}>
              <input ref={ingredientInput} type="search" value={ingredientSearch} onFocus={() => setOpenPopover('ingredients')} onChange={(event) => { setIngredientSearch(event.target.value); setOpenPopover('ingredients'); }} placeholder={ingredientIds.length ? `Ingredienser (${ingredientIds.length})` : 'Ingredienser'} aria-label="Sök och filtrera på ingredienser" aria-expanded={openPopover === 'ingredients'} aria-controls="ingredient-filter-options" />
              <button type="button" aria-label="Visa ingredienser" onClick={() => {
                if (openPopover === 'ingredients') { setOpenPopover(null); setIngredientSearch(''); }
                else { setOpenPopover('ingredients'); requestAnimationFrame(() => ingredientInput.current?.focus()); }
              }}><ChevronDownIcon className={openPopover === 'ingredients' ? 'is-rotated' : ''} /></button>
            </div>
            {openPopover === 'ingredients' && <div className="filter-popover ingredient-filter-popover" id="ingredient-filter-options">
              <div className="mode-switch" aria-label="Matchning av ingredienser"><button type="button" className={ingredientMode === 'any' ? 'active' : ''} onClick={() => updateParam('ingredientMode', 'any')}>Någon</button><button type="button" className={ingredientMode === 'all' ? 'active' : ''} onClick={() => updateParam('ingredientMode', 'all')}>Alla</button></div>
              <div className="filter-options">{ingredientAlternatives.length ? ingredientAlternatives.map(({ entry }) => <label key={entry.id}><input type="checkbox" checked={ingredientIds.includes(entry.id)} onChange={() => toggleList('ingredient', ingredientIds, entry.id)} /><span>{ingredientLabel(entry)}</span></label>) : <p className="filter-empty">Ingen ingrediens matchar.</p>}</div>
            </div>}
          </div>

          <div className="filter-control" data-popover-root><button className="filter-trigger" type="button" aria-expanded={openPopover === 'tags'} onClick={() => togglePopover('tags')}><span>Taggar{tagIds.length ? ` (${tagIds.length})` : ''}</span><ChevronDownIcon className={openPopover === 'tags' ? 'is-rotated' : ''} /></button>{openPopover === 'tags' && <div className="filter-popover"><div className="mode-switch" aria-label="Matchning av taggar"><button type="button" className={tagMode === 'any' ? 'active' : ''} onClick={() => updateParam('tagMode', 'any')}>Någon</button><button type="button" className={tagMode === 'all' ? 'active' : ''} onClick={() => updateParam('tagMode', 'all')}>Alla</button></div><div className="filter-options">{tags.map((tag) => <label key={tag.id}><input type="checkbox" checked={tagIds.includes(tag.id)} onChange={() => toggleList('tag', tagIds, tag.id)} /><span>{tag.name}</span></label>)}</div></div>}</div>

          <button className={favoritesOnly ? 'filter-trigger filter-button active' : 'filter-trigger filter-button'} type="button" onClick={() => updateParam('favorite', favoritesOnly ? null : '1')}><StarIcon /><span>Favoriter</span></button>

          <div className="filter-control" data-popover-root><button className="filter-trigger filter-trigger-split" type="button" aria-expanded={openPopover === 'time'} onClick={() => togglePopover('time')}><span className="filter-trigger-label">Tid</span><span>{timeLabel}</span><ChevronDownIcon className={openPopover === 'time' ? 'is-rotated' : ''} /></button>{openPopover === 'time' && <div className="filter-popover filter-choice-popover">{[['', 'Alla'], ['15', 'Högst 15 min'], ['30', 'Högst 30 min'], ['60', 'Högst 60 min']].map(([value, label]) => <button key={value || 'all'} type="button" className="filter-choice" onClick={() => { updateParam('maxTime', value || null); setOpenPopover(null); }}><span>{label}</span>{String(maxTime || '') === value && <CheckIcon />}</button>)}</div>}</div>

          <div className="filter-control" data-popover-root><button className="filter-trigger filter-trigger-split" type="button" aria-expanded={openPopover === 'sort'} onClick={() => togglePopover('sort')}><span className="filter-trigger-label">Sortera</span><span>{sortLabel}</span><ChevronDownIcon className={openPopover === 'sort' ? 'is-rotated' : ''} /></button>{openPopover === 'sort' && <div className="filter-popover filter-choice-popover align-right">{([['updated', 'Senast ändrad'], ['title', 'Namn'], ['time', 'Kortast tid']] as Array<[SortMode, string]>).map(([value, label]) => <button key={value} type="button" className="filter-choice" onClick={() => { updateParam('sort', value === 'updated' ? null : value); setOpenPopover(null); }}><span>{label}</span>{sort === value && <CheckIcon />}</button>)}</div>}</div>
        </div>
        {activeFilters.length > 0 && <div className="active-filter-row" aria-label="Aktiva filter">{activeFilters.map((filter) => <button key={filter.key} type="button" onClick={filter.remove}>{filter.label}<CloseIcon size={14} /></button>)}<button className="clear-filters" type="button" onClick={() => setParams({}, { replace: true })}>Rensa alla</button></div>}
      </section>
      {recipesStatus === 'loading' ? <section className="empty-state" role="status"><h2 className="heading-2">Läser lokala recept…</h2><p className="text-body-muted">Ditt offlinebibliotek öppnas på den här enheten.</p></section> : filtered.length ? <section className="recipe-grid" aria-label="Receptbibliotek">{filtered.map((recipe) => <RecipeCard key={recipe.id} recipe={recipe} to={`/recipes/${recipe.id}`} onFavorite={() => { void setLocalFavorite(recipe, !recipe.favorite).then(() => syncNow()); }} />)}</section> : <section className="empty-state"><div className="empty-state-icon" aria-hidden="true">✦</div><h2 className="heading-2">{recipes.length ? 'Inga recept matchar.' : 'Ditt kök börjar här.'}</h2><p className="text-body-muted">{recipes.length ? 'Prova en annan sökning eller ta bort ett filter.' : 'Lägg till ett recept med omslagsbild så finns det kvar även offline.'}</p>{!recipes.length && <Link className="primary-button" to="/recipes/new">Skapa första receptet</Link>}</section>}
    </main>
    <Link className="floating-add" to="/recipes/new" aria-label="Skapa recept"><PlusIcon size={28} /></Link>
  </div>;
}

function DetailRoute({ recipesState, onDelete }: { recipesState: LocalQueryState<LocalRecipe[]>; onDelete: (recipe: LocalRecipe) => Promise<void> }) {
  const { recipeId } = useParams();
  const recipe = recipesState.data.find((entry) => entry.id === recipeId);
  if (!recipe) return <div className="route-message page-container"><h1 className="heading-1">{recipesState.status === 'loading' ? 'Receptet hämtas…' : 'Receptet finns inte på enheten'}</h1><p className="text-body-muted">{recipesState.status === 'loading' ? 'Det lokala offlinebiblioteket läses in.' : 'Det kan ha tagits bort eller ännu inte ha synkroniserats hit.'}</p><Link to="/">Till recepten</Link></div>;
  return <RecipeDetail recipe={recipe} backTo="/" onDelete={() => void onDelete(recipe)} />;
}

function EditorRoute({ recipesState, catalog, tags, conflictsState }: { recipesState: LocalQueryState<LocalRecipe[]>; catalog: LocalIngredientCatalog[]; tags: LocalTag[]; conflictsState: LocalQueryState<RecipeConflict[]> }) {
  const { recipeId } = useParams();
  const navigate = useNavigate();
  const conflict = conflictsState.data.find((entry) => entry.entity_id === recipeId);
  const recipe = recipeId ? (conflict?.local_recipe ?? recipesState.data.find((entry) => entry.id === recipeId) ?? null) : null;
  if (conflict) return <Navigate to={`/recipes/${conflict.entity_id}/conflict`} replace />;
  if (recipeId && !recipe) {
    const loading = recipesState.status === 'loading' || conflictsState.status === 'loading';
    return <div className="route-message page-container"><h1 className="heading-1">{loading ? 'Receptet hämtas…' : 'Receptet finns inte på enheten'}</h1><p className="text-body-muted">{loading ? 'Det lokala offlinebiblioteket läses in.' : 'Det kan ha tagits bort eller ännu inte ha synkroniserats hit.'}</p><Link to="/">Till recepten</Link></div>;
  }
  async function save(draft: RecipeDraft, cover: CoverChange) {
    const saved = await saveLocalRecipe(recipe, draft, cover);
    navigate(`/recipes/${saved.id}`, { replace: true });
    void syncNow();
  }
  return <RecipeEditor recipe={recipe} catalog={catalog} tags={tags} onCancel={() => navigate(recipe ? `/recipes/${recipe.id}` : '/')} onSave={save} />;
}

function ConflictRoute({ conflictsState, catalog, tags }: { conflictsState: LocalQueryState<RecipeConflict[]>; catalog: LocalIngredientCatalog[]; tags: LocalTag[] }) {
  const { recipeId } = useParams();
  const navigate = useNavigate();
  const conflict = conflictsState.data.find((entry) => entry.entity_id === recipeId);
  if (!conflict) {
    if (conflictsState.status === 'loading') return <div className="route-message page-container"><h1 className="heading-1">Konflikten hämtas…</h1><p className="text-body-muted">Lokala synkdata läses in.</p></div>;
    return <Navigate to={recipeId ? `/recipes/${recipeId}` : '/'} replace />;
  }
  async function save(draft: RecipeDraft, cover: CoverChange) {
    if (cover.kind !== 'keep') throw new Error('En ny bild kan väljas efter att konflikten har lösts.');
    const resolvedId = await resolveConflictKeepLocal(conflict!, draft);
    navigate(`/recipes/${resolvedId}`, { replace: true });
  }
  return <ConflictResolution conflict={conflict} catalog={catalog} tags={tags} onCancel={() => navigate(`/recipes/${conflict.entity_id}`)} onSave={save} />;
}

export function HomePage({ email }: { email?: string }) {
  const recipesState = useRecipes();
  const conflictsState = useConflicts();
  const recipes = recipesState.data;
  const conflicts = conflictsState.data;
  const catalog = useIngredientCatalog();
  const tags = useTags();
  const sync = useSyncState();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => installSyncTriggers(), []);

  async function remove(recipe: LocalRecipe) {
    if (!window.confirm(`Ta bort ”${recipe.title}”? Ändringen synkroniseras mellan dina enheter.`)) return;
    await deleteLocalRecipe(recipe); navigate('/'); void syncNow();
  }
  async function keepLocal(conflict: RecipeConflict) {
    const resolvedId = await resolveConflictKeepLocal(conflict);
    navigate(`/recipes/${resolvedId}`, { replace: true });
  }
  async function keepServer(conflict: RecipeConflict) {
    await resolveConflictKeepServer(conflict);
    navigate(conflict.server_recipe ? `/recipes/${conflict.entity_id}` : '/', { replace: true });
  }

  const resolvingConflict = /^\/recipes\/[^/]+\/conflict$/.test(location.pathname);
  const dialog = !resolvingConflict && conflicts[0] && <ConflictDialog conflict={conflicts[0]} onKeepLocal={() => void keepLocal(conflicts[0])} onKeepServer={() => void keepServer(conflicts[0])} onMerge={() => navigate(`/recipes/${conflicts[0].entity_id}/conflict`)} />;
  return <><Routes>
    <Route path="/" element={<Library recipes={recipes} recipesStatus={recipesState.status} catalog={catalog} tags={tags} email={email} />} />
    <Route path="/recipes/new" element={<EditorRoute recipesState={recipesState} catalog={catalog} tags={tags} conflictsState={conflictsState} />} />
    <Route path="/recipes/:recipeId" element={<DetailRoute recipesState={recipesState} onDelete={remove} />} />
    <Route path="/recipes/:recipeId/edit" element={<EditorRoute recipesState={recipesState} catalog={catalog} tags={tags} conflictsState={conflictsState} />} />
    <Route path="/recipes/:recipeId/conflict" element={<ConflictRoute conflictsState={conflictsState} catalog={catalog} tags={tags} />} />
    <Route path="/settings" element={<SettingsView email={email} sync={sync} onBack={() => navigate('/')} onCleared={() => navigate('/')} />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>{dialog}</>;
}
