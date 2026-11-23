CREATE TABLE meal_plan_entries (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id),
  planned_date TEXT NOT NULL,
  servings INTEGER CHECK (servings IS NULL OR servings > 0),
  multiplier INTEGER NOT NULL CHECK (multiplier BETWEEN 1 AND 20),
  position INTEGER NOT NULL CHECK (position >= 0),
  version INTEGER NOT NULL CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX meal_plan_entries_date ON meal_plan_entries(planned_date, position);
CREATE INDEX meal_plan_entries_recipe ON meal_plan_entries(recipe_id, planned_date);

CREATE TABLE manual_shopping_items (
  id TEXT PRIMARY KEY,
  week_start TEXT NOT NULL,
  name TEXT NOT NULL,
  amount TEXT,
  unit TEXT,
  checked INTEGER NOT NULL CHECK (checked IN (0, 1)),
  version INTEGER NOT NULL CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX manual_shopping_items_week ON manual_shopping_items(week_start, created_at);

CREATE TABLE shopping_check_states (
  id TEXT PRIMARY KEY,
  week_start TEXT NOT NULL,
  item_key TEXT NOT NULL,
  source_signature TEXT NOT NULL,
  checked INTEGER NOT NULL CHECK (checked IN (0, 1)),
  version INTEGER NOT NULL CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE (week_start, item_key)
);

CREATE INDEX shopping_check_states_week ON shopping_check_states(week_start);

CREATE TABLE planning_changes (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('meal-plan', 'manual-item', 'check-state')),
  entity_id TEXT NOT NULL,
  entity_version INTEGER NOT NULL,
  changed_at TEXT NOT NULL,
  deleted INTEGER NOT NULL CHECK (deleted IN (0, 1))
);

CREATE INDEX planning_changes_sequence ON planning_changes(sequence);
CREATE INDEX planning_changes_entity ON planning_changes(entity_type, entity_id, sequence);

