CREATE TABLE recipe_images_v2 (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK (content_type = 'image/webp'),
  width INTEGER NOT NULL CHECK (width > 0 AND width <= 4096),
  height INTEGER NOT NULL CHECK (height > 0 AND height <= 4096),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 6291456),
  checksum_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

INSERT INTO recipe_images_v2 (
  id, object_key, content_type, width, height, byte_size, checksum_sha256, created_at, deleted_at
)
SELECT id, object_key, content_type, width, height, byte_size, checksum_sha256, created_at, deleted_at
FROM recipe_images;

DROP TABLE recipe_images;
ALTER TABLE recipe_images_v2 RENAME TO recipe_images;
CREATE INDEX recipe_images_active ON recipe_images(id, deleted_at);
