import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import { db, type LocalIngredientCatalog, type LocalManualShoppingItem, type LocalMealPlanEntry, type LocalRecipe, type LocalShoppingCheckState, type LocalTag, type RecipeConflict } from '../data/db';
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

export function useLocalRecipe(id: string | undefined): LocalQueryState<LocalRecipe | undefined> {
  const [state, setState] = useState<LocalQueryState<LocalRecipe | undefined>>({ status: 'loading', data: undefined });
  useEffect(() => {
    setState({ status: 'loading', data: undefined });
    const subscription = liveQuery(async () => id ? await db.recipes.get(id) : undefined).subscribe({
      next: (recipe) => setState({ status: 'ready', data: recipe?.deleted_at ? undefined : recipe }),
      error: (error) => setState({ status: 'error', data: undefined, error }),
    });
    return () => subscription.unsubscribe();
  }, [id]);
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

export function useMealPlanEntries(): LocalMealPlanEntry[] {
  const [entries, setEntries] = useState<LocalMealPlanEntry[]>([]);
  useEffect(() => {
    const subscription = liveQuery(() => db.mealPlanEntries.orderBy('planned_date').toArray())
      .subscribe({ next: (items) => setEntries(items.filter((item) => !item.deleted_at).sort((left, right) => left.planned_date.localeCompare(right.planned_date) || left.position - right.position)), error: (error) => console.error(error) });
    return () => subscription.unsubscribe();
  }, []);
  return entries;
}

export function useManualShoppingItems(): LocalManualShoppingItem[] {
  const [items, setItems] = useState<LocalManualShoppingItem[]>([]);
  useEffect(() => {
    const subscription = liveQuery(() => db.manualShoppingItems.orderBy('week_start').toArray())
      .subscribe({ next: (entries) => setItems(entries.filter((item) => !item.deleted_at)), error: (error) => console.error(error) });
    return () => subscription.unsubscribe();
  }, []);
  return items;
}

export function useShoppingCheckStates(): LocalShoppingCheckState[] {
  const [states, setStates] = useState<LocalShoppingCheckState[]>([]);
  useEffect(() => {
    const subscription = liveQuery(() => db.shoppingCheckStates.toArray())
      .subscribe({ next: (entries) => setStates(entries.filter((item) => !item.deleted_at)), error: (error) => console.error(error) });
    return () => subscription.unsubscribe();
  }, []);
  return states;
}
