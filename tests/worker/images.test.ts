import { env } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';
import { imageRoute } from '../../worker/routes/images';
import { imageLimits, imageObjectKey } from '../../shared/images';
import { jpegBytes, jpegFrame } from '../fixtures/jpeg';

function upload(id: string, key: string, full = jpegBytes(), thumbnail = jpegBytes()): Request {
  const form = new FormData();
  form.append('full', new Blob([full], { type: 'image/jpeg' }), 'ignored.jpg');
  form.append('thumbnail', new Blob([thumbnail], { type: 'image/jpeg' }), 'ignored.jpg');
  return new Request(`https://recipes.test/api/images/${id}`, { method: 'PUT', body: form, headers: { 'Idempotency-Key': key } });
}

describe('private JPEG image pairs', () => {
  it('stores and streams both variants and replays the same operation', async () => {
    const id = crypto.randomUUID(); const key = crypto.randomUUID();
    expect((await imageRoute(upload(id, key), env, 'upload')).status).toBe(201);
    const replay = await imageRoute(upload(id, key), env, 'replay');
    expect(replay.headers.get('Idempotency-Replayed')).toBe('true');
    for (const variant of ['full', 'thumbnail'] as const) {
      const download = await imageRoute(new Request(`https://recipes.test/api/images/${id}/${variant}`), env, 'download');
      expect(download.status).toBe(200);
      expect(download.headers.get('Content-Type')).toBe('image/jpeg');
      expect(new Uint8Array(await download.arrayBuffer())).toEqual(jpegBytes());
      const conditional = await imageRoute(new Request(`https://recipes.test/api/images/${id}/${variant}`, { headers: { 'If-None-Match': download.headers.get('ETag')! } }), env, 'conditional');
      expect(conditional.status).toBe(304);
    }
  });

  it('rejects invalid bytes, oversized frames and mismatched thumbnails before storing', async () => {
    for (const [full, thumbnail] of [
      [new TextEncoder().encode('not a jpeg'), jpegBytes()],
      [jpegFrame(2561, 1), jpegBytes()],
      [jpegFrame(1200, 800), jpegFrame(100, 100)],
    ]) {
      const id = crypto.randomUUID();
      expect((await imageRoute(upload(id, crypto.randomUUID(), full, thumbnail), env, 'invalid')).status).toBe(422);
      expect(await env.IMAGES.head(imageObjectKey(id, 'full'))).toBeNull();
    }
  });

  it('rejects a declared upload over the bounded multipart limit', async () => {
    const request = upload(crypto.randomUUID(), crypto.randomUUID());
    request.headers.set('Content-Length', String(imageLimits.fullBytes + imageLimits.thumbnailBytes + 4097));
    expect((await imageRoute(request, env, 'oversized')).status).toBe(413);
  });

  it('includes both variants in immutable content and idempotency checks', async () => {
    const id = crypto.randomUUID(); const key = crypto.randomUUID();
    await imageRoute(upload(id, key), env, 'first');
    const changed = jpegBytes(); changed[changed.length - 3] ^= 1;
    expect((await imageRoute(upload(id, key, jpegBytes(), changed), env, 'reuse')).status).toBe(409);
    expect((await imageRoute(upload(id, crypto.randomUUID(), jpegBytes(), changed), env, 'reuse-id')).status).toBe(409);
  });

  it('prevents concurrent uploads from mixing different content under one ID', async () => {
    const id = crypto.randomUUID(); const changed = jpegBytes(); changed[changed.length - 3] ^= 1;
    const responses = await Promise.all([
      imageRoute(upload(id, crypto.randomUUID()), env, 'first'),
      imageRoute(upload(id, crypto.randomUUID(), changed, changed), env, 'second'),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const expected = responses[0].status === 201 ? jpegBytes() : changed;
    for (const variant of ['full', 'thumbnail'] as const) {
      const object = await env.IMAGES.get(imageObjectKey(id, variant));
      expect(new Uint8Array(await object!.arrayBuffer())).toEqual(expected);
    }
  });

  it('keeps an interrupted pair unavailable and safely completes it on retry', async () => {
    const id = crypto.randomUUID(); const key = crypto.randomUUID();
    const put = env.IMAGES.put.bind(env.IMAGES);
    const mock = vi.spyOn(env.IMAGES, 'put').mockImplementationOnce(put).mockRejectedValueOnce(new Error('interrupted'));
    try { await expect(imageRoute(upload(id, key), env, 'interrupted')).rejects.toThrow('interrupted'); }
    finally { mock.mockRestore(); }
    expect((await imageRoute(new Request(`https://recipes.test/api/images/${id}/full`), env, 'pending')).status).toBe(404);
    expect((await imageRoute(upload(id, key), env, 'retry')).status).toBe(200);
    expect((await imageRoute(new Request(`https://recipes.test/api/images/${id}/thumbnail`), env, 'ready')).status).toBe(200);
  });

  it('removes both unreferenced variants and replays deletion', async () => {
    const id = crypto.randomUUID(); await imageRoute(upload(id, crypto.randomUUID()), env, 'upload');
    const key = crypto.randomUUID();
    const request = () => new Request(`https://recipes.test/api/images/${id}`, { method: 'DELETE', headers: { 'Idempotency-Key': key } });
    expect((await imageRoute(request(), env, 'delete')).status).toBe(200);
    expect((await imageRoute(request(), env, 'replay')).headers.get('Idempotency-Replayed')).toBe('true');
    expect(await env.IMAGES.head(imageObjectKey(id, 'full'))).toBeNull();
    expect(await env.IMAGES.head(imageObjectKey(id, 'thumbnail'))).toBeNull();
  });
});
