CREATE TABLE ingredients (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  amount TEXT,
  unit TEXT,
  name TEXT NOT NULL,
  group_name TEXT
);

CREATE INDEX ingredients_recipe_position ON ingredients(recipe_id, position);

CREATE TABLE instructions (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  text TEXT NOT NULL,
  timer_seconds INTEGER CHECK (timer_seconds IS NULL OR timer_seconds >= 0)
);

CREATE INDEX instructions_recipe_position ON instructions(recipe_id, position);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE recipe_tags (
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (recipe_id, tag_id)
);

CREATE INDEX recipe_tags_recipe_position ON recipe_tags(recipe_id, position);

CREATE TABLE recipe_changes (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id TEXT NOT NULL,
  recipe_version INTEGER NOT NULL,
  changed_at TEXT NOT NULL,
  deleted INTEGER NOT NULL CHECK (deleted IN (0, 1))
);

CREATE INDEX recipe_changes_sequence ON recipe_changes(sequence);
CREATE INDEX recipe_changes_recipe ON recipe_changes(recipe_id, sequence);

CREATE TABLE mutation_guards (
  operation_id TEXT PRIMARY KEY,
  valid INTEGER NOT NULL CHECK (valid = 1)
);

ALTER TABLE processed_operations ADD COLUMN method TEXT;
ALTER TABLE processed_operations ADD COLUMN path TEXT;
ALTER TABLE processed_operations ADD COLUMN request_hash TEXT;
ALTER TABLE processed_operations ADD COLUMN response_status INTEGER NOT NULL DEFAULT 200;

INSERT INTO recipe_changes (recipe_id, recipe_version, changed_at, deleted)
SELECT id, version, updated_at, CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END FROM recipes;
