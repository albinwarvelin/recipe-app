import { describe, expect, it } from 'vitest';
import { jpegDimensions } from '../../shared/images';
import { jpegBytes, jpegFrame } from '../fixtures/jpeg';

describe('JPEG header validation', () => {
  it('reads a real JPEG and its frame dimensions', () => {
    expect(jpegDimensions(jpegBytes().buffer)).toEqual({ width: 1, height: 1 });
    expect(jpegDimensions(jpegFrame(1600, 900).buffer)).toEqual({ width: 1600, height: 900 });
  });

  it('rejects non-JPEG, truncated segments and missing end markers', () => {
    expect(jpegDimensions(new TextEncoder().encode('not an image').buffer)).toBeNull();
    expect(jpegDimensions(jpegBytes().slice(0, -2).buffer)).toBeNull();
    const broken = jpegBytes(); broken[4] = 255; broken[5] = 255;
    expect(jpegDimensions(broken.buffer)).toBeNull();
    expect(jpegDimensions(jpegFrame(0, 1).buffer)).toBeNull();
  });
});
