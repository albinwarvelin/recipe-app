CREATE TABLE recipe_images (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK (content_type = 'image/jpeg'),
  width INTEGER NOT NULL CHECK (width > 0 AND width <= 2560),
  height INTEGER NOT NULL CHECK (height > 0 AND height <= 2560),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 6291456),
  checksum_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX recipe_images_active ON recipe_images(id, deleted_at);
