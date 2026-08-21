import { downloadImportedImage } from '../api/recipes';
import { prepareCoverImage, type PreparedCoverImage } from './process';

function importedImageExtension(contentType: string): string {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'image/heic') return 'heic';
  if (contentType === 'image/heif') return 'heif';
  return 'jpg';
}

export async function prepareImportedCoverImage(url: string): Promise<PreparedCoverImage> {
  const blob = await downloadImportedImage(url.trim());
  const extension = importedImageExtension(blob.type);
  return prepareCoverImage(new File([blob], `imported-cover.${extension}`, { type: blob.type }));
}
