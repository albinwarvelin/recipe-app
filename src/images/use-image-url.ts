import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import { db, type LocalImage } from '../data/db';

type ImageVariant = 'thumbnail' | 'full';
type CachedSource = { key: string; url: string };
type CachedEntry = CachedSource & { references: number; lastUsed: number };

const MAX_CACHED_URLS = 80;
const cachedUrls = new Map<string, CachedEntry>();

function cacheKey(image: LocalImage, variant: ImageVariant, blob: Blob): string {
  return `${image.id}:${variant}:${image.last_accessed_at}:${blob.type}:${blob.size}`;
}

function sourceForImage(image: LocalImage | undefined, full: boolean): { key: string; blob: Blob } | null {
  if (!image) return null;
  if (full && image.full_blob) return { key: cacheKey(image, 'full', image.full_blob), blob: image.full_blob };
  return image.thumbnail_blob ? { key: cacheKey(image, 'thumbnail', image.thumbnail_blob), blob: image.thumbnail_blob } : null;
}

function cachedSource(imageId: string, full: boolean): CachedSource | null {
  const candidates = full
    ? [`${imageId}:full:`, `${imageId}:thumbnail:`]
    : [`${imageId}:thumbnail:`];
  for (const prefix of candidates) {
    const cached = [...cachedUrls.values()].filter((entry) => entry.key.startsWith(prefix)).sort((a, b) => b.lastUsed - a.lastUsed)[0];
    if (cached) return { key: cached.key, url: cached.url };
  }
  return null;
}

function acquireSource(key: string, blob?: Blob): CachedSource | null {
  const existing = cachedUrls.get(key);
  if (existing) {
    existing.references += 1;
    existing.lastUsed = Date.now();
    pruneUnusedUrls();
    return { key, url: existing.url };
  }
  if (!blob) return null;
  const entry: CachedEntry = { key, url: URL.createObjectURL(blob), references: 1, lastUsed: Date.now() };
  cachedUrls.set(key, entry);
  pruneUnusedUrls();
  return { key, url: entry.url };
}

function pruneUnusedUrls(): void {
  if (cachedUrls.size <= MAX_CACHED_URLS) return;
  const removable = [...cachedUrls.values()]
    .filter((entry) => entry.references === 0)
    .sort((left, right) => left.lastUsed - right.lastUsed);
  for (const entry of removable) {
    if (cachedUrls.size <= MAX_CACHED_URLS) break;
    URL.revokeObjectURL(entry.url);
    cachedUrls.delete(entry.key);
  }
}

function releaseSource(key: string): void {
  const cached = cachedUrls.get(key);
  if (!cached) return;
  cached.references = Math.max(0, cached.references - 1);
  cached.lastUsed = Date.now();
}

export function useImageUrl(imageId: string | null | undefined, full = false): string | null {
  const [source, setSource] = useState<CachedSource | null>(() => imageId ? cachedSource(imageId, full) : null);

  useEffect(() => {
    let active = true;
    let activeKey: string | null = null;
    const initial = imageId ? cachedSource(imageId, full) : null;

    if (initial) {
      const acquired = acquireSource(initial.key);
      activeKey = acquired?.key ?? null;
      setSource(acquired);
    } else {
      setSource(null);
    }

    if (!imageId) return () => undefined;

    const subscription = liveQuery(() => db.images.get(imageId)).subscribe({
      next: (image) => {
        if (!active) return;
        const next = sourceForImage(image, full);
        if (!next) {
          if (activeKey) releaseSource(activeKey);
          activeKey = null;
          setSource(null);
          return;
        }
        if (full && activeKey?.startsWith(`${imageId}:full:`) && next.key.startsWith(`${imageId}:thumbnail:`)) return;
        if (activeKey === next.key) return;
        const acquired = acquireSource(next.key, next.blob);
        if (!acquired) return;
        const previousKey = activeKey;
        activeKey = acquired.key;
        setSource(acquired);
        if (previousKey) releaseSource(previousKey);
      },
      error: (error) => console.error(error),
    });

    return () => {
      active = false;
      subscription.unsubscribe();
      if (activeKey) releaseSource(activeKey);
    };
  }, [full, imageId]);

  return source?.url ?? null;
}
