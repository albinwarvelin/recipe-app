import { jpegDimensions, type ImageVariant } from '../../shared/images';
import { downloadImage } from '../api/recipes';
import { db } from '../data/db';

const requests = new Map<string, Promise<void>>();

async function cacheImage(id: string, variant: ImageVariant, refresh: boolean): Promise<void> {
  const existing = await db.images.get(id);
  const cached = variant === 'full' ? existing?.full_blob : existing?.thumbnail_blob;
  if (cached?.type === 'image/jpeg' && (!refresh || !existing?.remote)) return;
  const blob = await downloadImage(id, variant);
  const dimensions = jpegDimensions(await blob.arrayBuffer());
  if (!dimensions) throw new Error('Den hämtade bilden kunde inte läsas.');
  const timestamp = new Date().toISOString();
  await db.transaction('rw', db.images, async () => {
    // Read again inside the transaction so concurrent variant downloads merge.
    const current = await db.images.get(id);
    await db.images.put({
      ...current, id, remote: true,
      width: variant === 'full' ? dimensions.width : current?.width ?? dimensions.width,
      height: variant === 'full' ? dimensions.height : current?.height ?? dimensions.height,
      byte_size: variant === 'full' ? blob.size : current?.byte_size ?? 0,
      ...(variant === 'full' ? { full_blob: blob } : { thumbnail_blob: blob }),
      created_at: current?.created_at ?? timestamp, last_accessed_at: timestamp,
    });
  });
  if (variant === 'full') await pruneFullImageCache();
}

export function ensureImage(id: string, variant: ImageVariant, refresh = false): Promise<void> {
  const key = `${id}:${variant}`;
  const active = requests.get(key);
  if (active) return active;
  const request = cacheImage(id, variant, refresh).finally(() => requests.delete(key));
  requests.set(key, request);
  return request;
}

export async function pruneFullImageCache(): Promise<void> {
  const cached = (await db.images.toArray())
    .filter((image) => image.remote && image.full_blob)
    .sort((left, right) => right.last_accessed_at.localeCompare(left.last_accessed_at));
  for (const image of cached.slice(20)) await db.images.update(image.id, { full_blob: undefined });
}
