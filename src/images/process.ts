import { imageLimits } from '../../shared/images';

export interface PreparedCoverImage {
  id: string;
  full: Blob;
  thumbnail: Blob;
  width: number;
  height: number;
}

async function bitmapFromFile(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (cause) {
    // Decode natively first, including HEIC on browsers that support it.
    if (!/image\/hei[cf]/i.test(file.type) && !/\.hei[cf]$/i.test(file.name)) throw cause;
    const { heicTo } = await import('heic-to/csp');
    return heicTo({ blob: file, type: 'bitmap' }) as Promise<ImageBitmap>;
  }
}

async function jpeg(bitmap: ImageBitmap, maxDimension: number, quality: number): Promise<{ blob: Blob; width: number; height: number }> {
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  try {
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Bildbehandling är inte tillgänglig i den här webbläsaren.');
    // JPEG cover photos have no alpha channel. Flatten transparency onto white.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.type !== 'image/jpeg') throw new Error('Bilden kunde inte konverteras till JPEG. Försök igen eller välj en annan bild.');
    return { blob, width, height };
  } finally {
    // Release backing storage promptly on memory-constrained mobile devices.
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function prepareCoverImage(file: File): Promise<PreparedCoverImage> {
  if (file.size > imageLimits.inputBytes) throw new Error('Välj en bild som är mindre än 30 MB.');
  let bitmap: ImageBitmap;
  try { bitmap = await bitmapFromFile(file); }
  catch { throw new Error('Bilden kunde inte läsas. JPEG, PNG, WebP, HEIC och HEIF stöds.'); }
  try {
    const full = await jpeg(bitmap, imageLimits.fullDimension, 0.88);
    const thumbnail = await jpeg(bitmap, imageLimits.thumbnailDimension, 0.82);
    if (full.blob.size > imageLimits.fullBytes || thumbnail.blob.size > imageLimits.thumbnailBytes) {
      throw new Error('Den optimerade bilden är för stor. Välj en mindre bild.');
    }
    return { id: crypto.randomUUID(), full: full.blob, thumbnail: thumbnail.blob, width: full.width, height: full.height };
  } finally {
    bitmap.close();
  }
}
