import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import { db, type LocalIngredientCatalog, type LocalRecipe, type LocalTag, type RecipeConflict } from '../data/db';
import { subscribeSync, syncSnapshot, type SyncSnapshot } from '../sync/coordinator';

export type LocalQueryState<T> =
  | { status: 'loading'; data: T }
  | { status: 'ready'; data: T }
  | { status: 'error'; data: T; error: unknown };

export function useRecipes(): LocalQueryState<LocalRecipe[]> {
  const [state, setState] = useState<LocalQueryState<LocalRecipe[]>>({ status: 'loading', data: [] });
  useEffect(() => {
    const subscription = liveQuery(async () => (await db.recipes.toArray())
      .filter((recipe) => !recipe.deleted_at)
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at)))
      .subscribe({
        next: (recipes) => setState({ status: 'ready', data: recipes }),
        error: (error) => { console.error(error); setState((current) => ({ status: 'error', data: current.data, error })); },
      });
    return () => subscription.unsubscribe();
  }, []);
  return state;
}

export function useConflicts(): LocalQueryState<RecipeConflict[]> {
  const [state, setState] = useState<LocalQueryState<RecipeConflict[]>>({ status: 'loading', data: [] });
  useEffect(() => {
    const subscription = liveQuery(() => db.conflicts.orderBy('created_at').toArray())
      .subscribe({
        next: (conflicts) => setState({ status: 'ready', data: conflicts }),
        error: (error) => { console.error(error); setState((current) => ({ status: 'error', data: current.data, error })); },
      });
    return () => subscription.unsubscribe();
  }, []);
  return state;
}

export function useIngredientCatalog(): LocalIngredientCatalog[] {
  const [entries, setEntries] = useState<LocalIngredientCatalog[]>([]);
  useEffect(() => {
    const subscription = liveQuery(() => db.ingredientCatalog.toArray())
      .subscribe({ next: setEntries, error: (error) => console.error(error) });
    return () => subscription.unsubscribe();
  }, []);
  return entries;
}

export function useTags(): LocalTag[] {
  const [tags, setTags] = useState<LocalTag[]>([]);
  useEffect(() => {
    const subscription = liveQuery(() => db.tags.orderBy('name').toArray())
      .subscribe({ next: setTags, error: (error) => console.error(error) });
    return () => subscription.unsubscribe();
  }, []);
  return tags;
}

export function useSyncState(): SyncSnapshot {
  const [state, setState] = useState(syncSnapshot);
  useEffect(() => subscribeSync(setState), []);
  return state;
}
