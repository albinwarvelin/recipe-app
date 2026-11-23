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

async function canvasBlob(bitmap: ImageBitmap, maxDimension: number, quality: number, type = 'image/webp'): Promise<{ blob: Blob; width: number; height: number }> {
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Bildbehandling är inte tillgänglig i den här webbläsaren.');
  try {
    context.drawImage(bitmap, 0, 0, width, height);
    let blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
    // Safari can decode WebP but returns PNG when asked to encode it. Keep
    // uploads genuinely WebP using an on-device encoder, off the UI thread.
    if (type === 'image/webp' && blob && blob.type !== type) {
      const { encodeWebp } = await import('./encode-webp');
      blob = await encodeWebp(context.getImageData(0, 0, width, height), quality);
    }
    if (!blob || blob.type !== type) throw new Error('Bilden kunde inte konverteras. Försök igen eller välj en annan bild.');
    return { blob, width, height };
  } finally {
    // Release backing storage promptly on memory-constrained mobile devices.
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function prepareCoverImage(file: File): Promise<PreparedCoverImage> {
  if (file.size > MAX_INPUT_BYTES) throw new Error('Välj en bild som är mindre än 30 MB.');
  let bitmap: ImageBitmap;
  try { bitmap = await bitmapFromFile(file); }
  catch { throw new Error('Bilden kunde inte läsas. JPEG, PNG, WebP, HEIC och HEIF stöds.'); }
  try {
    let full = await canvasBlob(bitmap, FULL_IMAGE_DIMENSION, 0.88);
    if (full.blob.size > MAX_OUTPUT_BYTES) full = await canvasBlob(bitmap, FULL_IMAGE_DIMENSION, 0.78);
    if (full.blob.size > MAX_OUTPUT_BYTES) full = await canvasBlob(bitmap, 2048, 0.76);
    if (full.blob.size > MAX_OUTPUT_BYTES) throw new Error('Den optimerade bilden är fortfarande större än 6 MB. Välj en mindre bild.');
    // Thumbnails stay in IndexedDB and do not need the upload API's WebP format.
    const thumbnail = await canvasBlob(bitmap, THUMBNAIL_DIMENSION, 0.82, 'image/jpeg');
    return { id: crypto.randomUUID(), full: full.blob, thumbnail: thumbnail.blob, width: full.width, height: full.height };
  } finally {
    bitmap.close();
  }
}

export async function thumbnailFromWebp(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  try { return (await canvasBlob(bitmap, THUMBNAIL_DIMENSION, 0.82, 'image/jpeg')).blob; }
  finally { bitmap.close(); }
}
