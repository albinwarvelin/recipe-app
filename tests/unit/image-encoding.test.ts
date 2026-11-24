import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { prepareCoverImage } from '../../src/images/process';

const heicTo = vi.hoisted(() => vi.fn());
vi.mock('heic-to/csp', () => ({ heicTo }));
const close = vi.fn();
const canvases: Array<{ width: number; height: number }> = [];
const fillRect = vi.fn();
let outputType: string | null = 'image/jpeg';

beforeEach(() => {
  vi.clearAllMocks(); canvases.length = 0; outputType = 'image/jpeg';
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 4000, height: 3000, close })));
  vi.stubGlobal('document', { createElement: () => {
    const canvas = {
      width: 0, height: 0,
      getContext: () => ({ drawImage: vi.fn(), fillRect, fillStyle: '' }),
      toBlob: (callback: BlobCallback, type: string) => {
        expect(type).toBe('image/jpeg');
        callback(outputType ? new Blob(['image'], { type: outputType }) : null);
      },
    };
    canvases.push(canvas); return canvas;
  } });
});
afterEach(() => vi.unstubAllGlobals());

it('prepares a capped JPEG cover and thumbnail using one native decode', async () => {
  const image = await prepareCoverImage(new File(['input'], 'cover.png', { type: 'image/png' }));
  expect(image).toMatchObject({ width: 2560, height: 1920 });
  expect(image.full.type).toBe('image/jpeg');
  expect(image.thumbnail.type).toBe('image/jpeg');
  expect(fillRect.mock.calls).toEqual([[0, 0, 2560, 1920], [0, 0, 720, 540]]);
  expect(createImageBitmap).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
  expect(canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
});

it('uses native HEIC support without loading the fallback decoder', async () => {
  await prepareCoverImage(new File(['input'], 'photo.heic', { type: 'image/heic' }));
  expect(heicTo).not.toHaveBeenCalled();
});

it('uses the HEIC decoder only when native decoding rejects an Apple photo', async () => {
  vi.mocked(createImageBitmap).mockRejectedValue(new Error('unsupported'));
  heicTo.mockResolvedValue({ width: 100, height: 100, close });
  const file = new File(['input'], 'photo.heic', { type: 'image/heic' });
  expect((await prepareCoverImage(file)).width).toBe(100);
  expect(heicTo).toHaveBeenCalledExactlyOnceWith({ blob: file, type: 'bitmap' });
});

it.each(['image/png', null])('rejects unusable JPEG output (%s) and releases resources', async (type) => {
  outputType = type;
  await expect(prepareCoverImage(new File(['input'], 'cover.jpg', { type: 'image/jpeg' }))).rejects.toThrow('JPEG');
  expect(close).toHaveBeenCalledOnce();
  expect(canvases[0]).toMatchObject({ width: 0, height: 0 });
});
