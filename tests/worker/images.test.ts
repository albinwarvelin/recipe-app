import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { imageRoute } from '../../worker/routes/images';

function imageBytes(): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set([82, 73, 70, 70], 0); bytes.set([87, 69, 66, 80], 8); bytes.set([86, 80, 56, 88], 12);
  return bytes;
}

describe('private image persistence', () => {
  it('validates, stores, and streams a WebP cover', async () => {
    const imageId = crypto.randomUUID();
    const body = imageBytes();
    const upload = await imageRoute(new Request(`https://recipes.test/api/images/${imageId}`, {
      method: 'PUT', body: body.buffer as ArrayBuffer,
      headers: { 'Content-Type': 'image/webp', 'Content-Length': String(body.byteLength), 'X-Image-Width': '1', 'X-Image-Height': '1', 'Idempotency-Key': crypto.randomUUID() },
    }), env, crypto.randomUUID());
    expect(upload.status).toBe(201);
    expect(await upload.json()).toMatchObject({ image: { id: imageId, width: 1, height: 1 } });

    const download = await imageRoute(new Request(`https://recipes.test/api/images/${imageId}`), env, crypto.randomUUID());
    expect(download.status).toBe(200);
    expect(download.headers.get('Content-Type')).toBe('image/webp');
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(body);
  });

  it('rejects content that only claims to be WebP', async () => {
    const body = new TextEncoder().encode('not a webp');
    const response = await imageRoute(new Request(`https://recipes.test/api/images/${crypto.randomUUID()}`, {
      method: 'PUT', body: body.buffer as ArrayBuffer,
      headers: { 'Content-Type': 'image/webp', 'X-Image-Width': '1', 'X-Image-Height': '1', 'Idempotency-Key': crypto.randomUUID() },
    }), env, crypto.randomUUID());
    expect(response.status).toBe(422);
  });

  it('rejects a declared cover larger than 6 MB before buffering it', async () => {
    const response = await imageRoute(new Request(`https://recipes.test/api/images/${crypto.randomUUID()}`, {
      method: 'PUT', body: imageBytes().buffer as ArrayBuffer,
      headers: { 'Content-Type': 'image/webp', 'Content-Length': String(6 * 1024 * 1024 + 1), 'X-Image-Width': '1', 'X-Image-Height': '1', 'Idempotency-Key': crypto.randomUUID() },
    }), env, crypto.randomUUID());
    expect(response.status).toBe(413);
  });
});
