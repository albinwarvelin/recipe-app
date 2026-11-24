import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearLocalData, db } from '../../src/data/db';
import { ensureImage } from '../../src/images/cache';
import { jpegBytes } from '../fixtures/jpeg';

beforeEach(async () => {
  await clearLocalData();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob([jpegBytes()], { type: 'image/jpeg' }))));
  // Downloads must never need a decoder, canvas or encoder.
  vi.stubGlobal('createImageBitmap', vi.fn(() => { throw new Error('Unexpected decode'); }));
  vi.stubGlobal('document', { createElement: () => { throw new Error('Unexpected canvas'); } });
});
afterEach(() => vi.unstubAllGlobals());

it('downloads only the thumbnail and reuses its durable cache', async () => {
  const id = crypto.randomUUID();
  await Promise.all([ensureImage(id, 'thumbnail'), ensureImage(id, 'thumbnail')]);
  expect(fetch).toHaveBeenCalledExactlyOnceWith(`/api/images/${id}/thumbnail`, expect.any(Object));
  const image = await db.images.get(id);
  expect(image?.thumbnail_blob?.type).toBe('image/jpeg');
  expect(image?.full_blob).toBeUndefined();
  db.close(); await db.open();
  await ensureImage(id, 'thumbnail');
  expect(fetch).toHaveBeenCalledOnce();
});

it('merges independently downloaded variants without losing either blob', async () => {
  const id = crypto.randomUUID();
  await Promise.all([ensureImage(id, 'thumbnail'), ensureImage(id, 'full')]);
  const image = await db.images.get(id);
  expect(image?.full_blob?.type).toBe('image/jpeg');
  expect(image?.thumbnail_blob?.type).toBe('image/jpeg');
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('caches a full image even if its thumbnail cannot be downloaded', async () => {
  const id = crypto.randomUUID();
  vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 503 }));
  await expect(ensureImage(id, 'thumbnail')).rejects.toThrow();
  await ensureImage(id, 'full');
  expect((await db.images.get(id))?.full_blob?.type).toBe('image/jpeg');
  expect((await db.images.get(id))?.thumbnail_blob).toBeUndefined();
});

it('does not discard a pending local cover when refresh is requested', async () => {
  const id = crypto.randomUUID();
  const blob = new Blob([jpegBytes()], { type: 'image/jpeg' });
  await db.images.put({ id, full_blob: blob, thumbnail_blob: blob, width: 1, height: 1, byte_size: blob.size, remote: false, created_at: '', last_accessed_at: '' });
  await ensureImage(id, 'full', true);
  expect(fetch).not.toHaveBeenCalled();
});
