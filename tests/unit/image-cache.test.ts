import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearLocalData, db } from '../../src/data/db';
import { ensureFullImage, ensureThumbnailImage } from '../../src/sync/coordinator';

beforeEach(async () => {
  await clearLocalData();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['webp'], { type: 'image/webp' }))));
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 1200, height: 800, close: vi.fn() })));
  // Model Safari's canvas: WebP requests produce PNG; JPEG requests work.
  vi.stubGlobal('document', { createElement: () => ({
    width: 0, height: 0, getContext: () => ({ drawImage: vi.fn() }),
    toBlob: (callback: BlobCallback, type: string) => callback(new Blob(['thumbnail'], { type: type === 'image/webp' ? 'image/png' : type })),
  }) });
});

afterEach(() => vi.unstubAllGlobals());

it('caches a downloaded cover thumbnail on a browser without WebP encoding', async () => {
  const id = crypto.randomUUID();
  await ensureThumbnailImage(id);
  const image = await db.images.get(id);
  expect(image).toMatchObject({ remote: true, width: 1200, height: 800 });
  expect(image?.thumbnail_blob.type).toBe('image/jpeg');
  await ensureThumbnailImage(id);
  expect(fetch).toHaveBeenCalledOnce();
});

it('opens a previously uncached full cover on a browser without WebP encoding', async () => {
  const id = crypto.randomUUID();
  await ensureFullImage(id);
  const image = await db.images.get(id);
  expect(image?.full_blob?.type).toBe('image/webp');
  expect(image?.thumbnail_blob.type).toBe('image/jpeg');
});
