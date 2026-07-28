CREATE TABLE recipes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  servings INTEGER,
  prep_minutes INTEGER,
  cook_minutes INTEGER,
  source_type TEXT NOT NULL DEFAULT 'personal',
  source_name TEXT,
  source_url TEXT,
  image_key TEXT,
  notes TEXT NOT NULL DEFAULT '',
  favorite INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE processed_operations (
  operation_id TEXT PRIMARY KEY,
  processed_at TEXT NOT NULL,
  response_json TEXT NOT NULL
);
