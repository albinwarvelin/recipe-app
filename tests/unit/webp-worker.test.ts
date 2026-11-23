import { afterEach, expect, it, vi } from 'vitest';
import { encodeWebp } from '../../src/images/encode-webp';

afterEach(() => vi.unstubAllGlobals());

it('transfers pixels to the worker and releases it after encoding', async () => {
  const terminate = vi.fn();
  const postMessage = vi.fn();
  const worker = { terminate, postMessage, onmessage: null as null | ((event: { data: ArrayBuffer | null }) => void) };
  vi.stubGlobal('Worker', vi.fn(function () { return worker; }));
  const pixels = { data: new Uint8ClampedArray(4), width: 1, height: 1 } as ImageData;
  const result = encodeWebp(pixels, 0.88);
  expect(postMessage).toHaveBeenCalledWith({ pixels, quality: 0.88 }, [pixels.data.buffer]);
  worker.onmessage!({ data: new Uint8Array([1, 2, 3]).buffer });
  expect((await result).type).toBe('image/webp');
  expect(terminate).toHaveBeenCalledOnce();
});

it('rejects encoding failures and terminates the worker', async () => {
  const worker = { terminate: vi.fn(), postMessage: vi.fn(), onerror: null as null | (() => void) };
  vi.stubGlobal('Worker', vi.fn(function () { return worker; }));
  const result = encodeWebp({ data: new Uint8ClampedArray(4) } as ImageData, 0.88);
  const assertion = expect(result).rejects.toThrow('Bilden kunde inte konverteras');
  worker.onerror!();
  await assertion;
  expect(worker.terminate).toHaveBeenCalledOnce();
});
