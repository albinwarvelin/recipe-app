export type ImageVariant = 'full' | 'thumbnail';

export const imageLimits = {
  inputBytes: 30 * 1024 * 1024,
  fullBytes: 6 * 1024 * 1024,
  thumbnailBytes: 512 * 1024,
  fullDimension: 2560,
  thumbnailDimension: 720,
} as const;

export function imageObjectKey(id: string, variant: ImageVariant): string {
  return `covers/${id}/${variant}.jpg`;
}

/** Read a baseline/progressive JPEG frame; never trust client-supplied dimensions. */
export function jpegDimensions(buffer: ArrayBuffer): { width: number; height: number } | null {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) return null;
  let offset = 2;
  let dimensions: { width: number; height: number } | null = null;
  while (offset < bytes.length - 2) {
    if (bytes[offset++] !== 0xff) return null;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (offset + 2 > bytes.length) return null;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length - 2) return null;
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 11 || bytes[offset + 2] !== 8 || length !== 8 + 3 * bytes[offset + 7]) return null;
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      if (!width || !height || dimensions) return null;
      dimensions = { width, height };
    }
    if (marker === 0xda) return offset + length < bytes.length - 2 ? dimensions : null;
    offset += length;
  }
  return null;
}
