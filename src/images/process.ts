export interface PreparedCoverImage {
  id: string;
  full: Blob;
  thumbnail: Blob;
  width: number;
  height: number;
}

const MAX_INPUT_BYTES = 30 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 6 * 1024 * 1024;
const FULL_IMAGE_DIMENSION = 2560;
const THUMBNAIL_DIMENSION = 720;

async function bitmapFromFile(file: File): Promise<ImageBitmap> {
  const looksHeic = /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
  if (looksHeic) {
    const { heicTo } = await import('heic-to/csp');
    return heicTo({ blob: file, type: 'bitmap' }) as Promise<ImageBitmap>;
  }
  return createImageBitmap(file, { imageOrientation: 'from-image' });
}

function canvasBlob(bitmap: ImageBitmap, maxDimension: number, quality: number): Promise<{ blob: Blob; width: number; height: number }> {
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Image processing is unavailable in this browser.');
  context.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve({ blob, width, height }) : reject(new Error('The image could not be converted to WebP.')),
    'image/webp',
    quality,
  ));
}

export async function prepareCoverImage(file: File): Promise<PreparedCoverImage> {
  if (file.size > MAX_INPUT_BYTES) throw new Error('Choose an image smaller than 30 MB.');
  let bitmap: ImageBitmap;
  try { bitmap = await bitmapFromFile(file); }
  catch { throw new Error('This photo could not be decoded. JPEG, PNG, WebP, HEIC, and HEIF are supported.'); }
  try {
    let full = await canvasBlob(bitmap, FULL_IMAGE_DIMENSION, 0.88);
    if (full.blob.size > MAX_OUTPUT_BYTES) full = await canvasBlob(bitmap, FULL_IMAGE_DIMENSION, 0.78);
    if (full.blob.size > MAX_OUTPUT_BYTES) full = await canvasBlob(bitmap, 2048, 0.76);
    if (full.blob.size > MAX_OUTPUT_BYTES) throw new Error('The optimized image is still larger than 6 MB. Choose a smaller photo.');
    const thumbnail = await canvasBlob(bitmap, THUMBNAIL_DIMENSION, 0.82);
    return { id: crypto.randomUUID(), full: full.blob, thumbnail: thumbnail.blob, width: full.width, height: full.height };
  } finally {
    bitmap.close();
  }
}

export async function thumbnailFromWebp(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  try { return (await canvasBlob(bitmap, THUMBNAIL_DIMENSION, 0.82)).blob; }
  finally { bitmap.close(); }
}
