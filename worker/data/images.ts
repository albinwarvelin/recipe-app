export interface ImageRow {
  id: string;
  object_key: string;
  content_type: 'image/webp';
  width: number;
  height: number;
  byte_size: number;
  checksum_sha256: string;
  created_at: string;
  deleted_at: string | null;
}

export function getImage(db: D1Database, imageId: string, includeDeleted = false): Promise<ImageRow | null> {
  const deletedClause = includeDeleted ? '' : ' AND deleted_at IS NULL';
  return db.prepare(`SELECT * FROM recipe_images WHERE id = ?1${deletedClause}`).bind(imageId).first<ImageRow>();
}

export async function imageReferenceExists(db: D1Database, imageId: string | null | undefined): Promise<boolean> {
  if (!imageId) return true;
  return Boolean(await db.prepare('SELECT 1 AS found FROM recipe_images WHERE id = ?1 AND deleted_at IS NULL').bind(imageId).first());
}
