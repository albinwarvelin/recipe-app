import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { prepareCoverImage, thumbnailFromWebp } from '../../src/images/process';
import { encodeWebp } from '../../src/images/encode-webp';

vi.mock('../../src/images/encode-webp', () => ({ encodeWebp: vi.fn() }));

const close = vi.fn();
const canvases: Array<{ width: number; height: number }> = [];
const pixels = { data: new Uint8ClampedArray(4), width: 1, height: 1 } as ImageData;

function browserEncoder(webpSupported: boolean) {
  const toBlob = vi.fn((callback: BlobCallback, type: string) => {
    callback(new Blob(['image'], { type: type === 'image/webp' && !webpSupported ? 'image/png' : type }));
  });
  vi.stubGlobal('document', { createElement: () => {
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: vi.fn(), getImageData: () => pixels }), toBlob };
    canvases.push(canvas);
    return canvas;
  } });
  return toBlob;
}

beforeEach(() => {
  vi.clearAllMocks();
  canvases.length = 0;
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 100, height: 100, close })));
  vi.mocked(encodeWebp).mockResolvedValue(new Blob(['webp'], { type: 'image/webp' }));
});

afterEach(() => vi.unstubAllGlobals());

it('imports on Safari using the local WebP encoder when canvas returns PNG', async () => {
  browserEncoder(false);
  const image = await prepareCoverImage(new File(['input'], 'cover.jpg', { type: 'image/jpeg' }));
  expect(image.full.type).toBe('image/webp');
  expect(image.thumbnail.type).toBe('image/jpeg');
  expect(encodeWebp).toHaveBeenCalledExactlyOnceWith(pixels, 0.88);
  expect(close).toHaveBeenCalledOnce();
  expect(canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
});

it('keeps native WebP encoding on supporting browsers', async () => {
  browserEncoder(true);
  const image = await prepareCoverImage(new File(['input'], 'cover.png', { type: 'image/png' }));
  expect(image.full.type).toBe('image/webp');
  expect(encodeWebp).not.toHaveBeenCalled();
});

it('creates thumbnails for downloaded WebP without needing WebP encoding', async () => {
  const toBlob = browserEncoder(false);
  const thumbnail = await thumbnailFromWebp(new Blob(['downloaded'], { type: 'image/webp' }));
  expect(thumbnail.type).toBe('image/jpeg');
  expect(toBlob).toHaveBeenCalledExactlyOnceWith(expect.any(Function), 'image/jpeg', 0.82);
  expect(encodeWebp).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
});

it('releases image resources when the fallback encoder fails', async () => {
  browserEncoder(false);
  vi.mocked(encodeWebp).mockRejectedValue(new Error('encoder failed'));
  await expect(prepareCoverImage(new File(['input'], 'cover.jpg', { type: 'image/jpeg' }))).rejects.toThrow('encoder failed');
  expect(close).toHaveBeenCalledOnce();
  expect(canvases[0]).toMatchObject({ width: 0, height: 0 });
});
