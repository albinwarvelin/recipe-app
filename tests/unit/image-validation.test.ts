import { describe, expect, it } from 'vitest';
import { webpDimensions } from '../../worker/routes/images';

function vp8x(width: number, height: number): ArrayBuffer {
  const bytes = new Uint8Array(30);
  bytes.set([82, 73, 70, 70], 0); // RIFF
  bytes.set([87, 69, 66, 80], 8); // WEBP
  bytes.set([86, 80, 56, 88], 12); // VP8X
  const write24 = (offset: number, value: number) => { bytes[offset] = value & 255; bytes[offset + 1] = (value >> 8) & 255; bytes[offset + 2] = (value >> 16) & 255; };
  write24(24, width - 1); write24(27, height - 1);
  return bytes.buffer;
}

describe('WebP content validation', () => {
  it('reads dimensions from VP8X content rather than trusting a filename', () => {
    expect(webpDimensions(vp8x(1600, 900))).toEqual({ width: 1600, height: 900 });
  });

  it('rejects non-WebP content', () => {
    expect(webpDimensions(new TextEncoder().encode('not an image').buffer as ArrayBuffer)).toBeNull();
  });
});
