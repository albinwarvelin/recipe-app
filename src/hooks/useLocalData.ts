import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import { db, type LocalImage, type LocalIngredientCatalog, type LocalRecipe, type LocalTag, type RecipeConflict } from '../data/db';
import { subscribeSync, syncSnapshot, type SyncSnapshot } from '../sync/coordinator';

export function useRecipes(): LocalRecipe[] {
  const [recipes, setRecipes] = useState<LocalRecipe[]>([]);
  useEffect(() => {
    const subscription = liveQuery(async () => (await db.recipes.toArray())
      .filter((recipe) => !recipe.deleted_at)
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at)))
      .subscribe({ next: setRecipes, error: (error) => console.error(error) });
    return () => subscription.unsubscribe();
  }, []);
  return recipes;
}

export function useConflicts(): RecipeConflict[] {
  const [conflicts, setConflicts] = useState<RecipeConflict[]>([]);
  useEffect(() => {
    const subscription = liveQuery(() => db.conflicts.orderBy('created_at').toArray())
      .subscribe({ next: setConflicts, error: (error) => console.error(error) });
    return () => subscription.unsubscribe();
  }, []);
  return conflicts;
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

export function useImageUrl(imageId: string | null | undefined, full = false): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let currentUrl: string | null = null;
    if (!imageId) { setUrl(null); return; }
    const subscription = liveQuery(() => db.images.get(imageId)).subscribe({
      next: (image: LocalImage | undefined) => {
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        const blob = full ? image?.full_blob ?? image?.thumbnail_blob : image?.thumbnail_blob;
        currentUrl = blob ? URL.createObjectURL(blob) : null;
        setUrl(currentUrl);
      },
      error: (error) => console.error(error),
    });
    return () => { subscription.unsubscribe(); if (currentUrl) URL.revokeObjectURL(currentUrl); };
  }, [full, imageId]);
  return url;
}
