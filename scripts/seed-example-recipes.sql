-- Idempotent production-safe examples. Fixed UUIDs make this file safe to rerun.
INSERT OR IGNORE INTO recipes (
  id, title, description, servings, prep_minutes, cook_minutes, source_type,
  source_name, source_url, image_key, notes, favorite, version, created_at, updated_at, deleted_at
) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Roasted tomato rigatoni', 'A silky tomato pasta with roasted garlic, basil, and a little mascarpone.', 4, 15, 40, 'personal', 'Recipe App examples', NULL, NULL, 'Reserve some pasta water before draining.', 1, 1, '2026-08-07T12:00:00.000Z', '2026-08-07T12:00:00.000Z', NULL),
  ('22222222-2222-4222-8222-222222222222', 'Miso-glazed salmon bowls', 'Caramelized salmon with rice, cucumber, avocado, and a bright sesame dressing.', 2, 20, 20, 'personal', 'Recipe App examples', NULL, NULL, 'The glaze also works well with tofu.', 0, 1, '2026-08-07T12:01:00.000Z', '2026-08-07T12:01:00.000Z', NULL),
  ('33333333-3333-4333-8333-333333333333', 'Cardamom apple overnight oats', 'Creamy overnight oats layered with cardamom apples and toasted almonds.', 2, 10, 8, 'personal', 'Recipe App examples', NULL, NULL, 'Keeps refrigerated for up to three days.', 0, 1, '2026-08-07T12:02:00.000Z', '2026-08-07T12:02:00.000Z', NULL),
  ('44444444-4444-4444-8444-444444444444', 'Crispy chickpea herb salad', 'A fresh, substantial salad with crunchy chickpeas, herbs, feta, and lemon.', 4, 20, 25, 'personal', 'Recipe App examples', NULL, NULL, 'Dress just before serving to keep the herbs crisp.', 0, 1, '2026-08-07T12:03:00.000Z', '2026-08-07T12:03:00.000Z', NULL);

INSERT OR IGNORE INTO ingredients (id, recipe_id, position, amount, unit, name, group_name) VALUES
  ('10000001-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 0, '700', 'g', 'cherry tomatoes', NULL),
  ('10000001-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 1, '4', NULL, 'garlic cloves', NULL),
  ('10000001-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 2, '350', 'g', 'rigatoni', NULL),
  ('10000001-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 3, '100', 'g', 'mascarpone', NULL),
  ('10000001-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 4, '1', 'handful', 'fresh basil', NULL),
  ('20000002-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 0, '2', NULL, 'salmon fillets', 'Salmon'),
  ('20000002-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 1, '1', 'tbsp', 'white miso', 'Glaze'),
  ('20000002-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 2, '1', 'tbsp', 'soy sauce', 'Glaze'),
  ('20000002-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222', 3, '300', 'g', 'cooked rice', 'Bowls'),
  ('20000002-0000-4000-8000-000000000005', '22222222-2222-4222-8222-222222222222', 4, '0.5', NULL, 'cucumber, thinly sliced', 'Bowls'),
  ('30000003-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 0, '100', 'g', 'rolled oats', NULL),
  ('30000003-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333', 1, '250', 'ml', 'milk', NULL),
  ('30000003-0000-4000-8000-000000000003', '33333333-3333-4333-8333-333333333333', 2, '1', NULL, 'apple, diced', 'Apple topping'),
  ('30000003-0000-4000-8000-000000000004', '33333333-3333-4333-8333-333333333333', 3, '0.5', 'tsp', 'ground cardamom', 'Apple topping'),
  ('30000003-0000-4000-8000-000000000005', '33333333-3333-4333-8333-333333333333', 4, '2', 'tbsp', 'toasted almonds', NULL),
  ('40000004-0000-4000-8000-000000000001', '44444444-4444-4444-8444-444444444444', 0, '400', 'g', 'chickpeas, drained', NULL),
  ('40000004-0000-4000-8000-000000000002', '44444444-4444-4444-8444-444444444444', 1, '1', NULL, 'cucumber, chopped', NULL),
  ('40000004-0000-4000-8000-000000000003', '44444444-4444-4444-8444-444444444444', 2, '150', 'g', 'feta', NULL),
  ('40000004-0000-4000-8000-000000000004', '44444444-4444-4444-8444-444444444444', 3, '2', 'handfuls', 'mixed parsley, mint, and dill', NULL),
  ('40000004-0000-4000-8000-000000000005', '44444444-4444-4444-8444-444444444444', 4, '1', NULL, 'lemon', 'Dressing');

INSERT OR IGNORE INTO instructions (id, recipe_id, position, text, timer_seconds) VALUES
  ('11000001-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 0, 'Heat the oven to 220°C. Toss the tomatoes and garlic with olive oil, salt, and pepper.', NULL),
  ('11000001-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 1, 'Roast until the tomatoes collapse and caramelize at the edges.', 1800),
  ('11000001-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 2, 'Cook the rigatoni until al dente. Blend the roasted tomatoes with mascarpone and a splash of pasta water.', NULL),
  ('11000001-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 3, 'Toss the pasta through the sauce and finish with torn basil.', NULL),
  ('22000002-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 0, 'Mix the miso and soy sauce with a teaspoon of honey and brush over the salmon.', NULL),
  ('22000002-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 1, 'Bake at 210°C until just cooked and caramelized.', 720),
  ('22000002-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 2, 'Divide warm rice between bowls and add cucumber and avocado if available.', NULL),
  ('22000002-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222', 3, 'Top with salmon and spoon over any remaining glaze.', NULL),
  ('33000003-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 0, 'Stir the oats and milk together, cover, and refrigerate overnight.', NULL),
  ('33000003-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333', 1, 'Cook the apple with cardamom and a splash of water until tender.', 480),
  ('33000003-0000-4000-8000-000000000003', '33333333-3333-4333-8333-333333333333', 2, 'Cool the apple topping, then layer it over the oats.', NULL),
  ('33000003-0000-4000-8000-000000000004', '33333333-3333-4333-8333-333333333333', 3, 'Scatter with toasted almonds before serving.', NULL),
  ('44000004-0000-4000-8000-000000000001', '44444444-4444-4444-8444-444444444444', 0, 'Pat the chickpeas dry, season, and roast at 220°C until crisp.', 1500),
  ('44000004-0000-4000-8000-000000000002', '44444444-4444-4444-8444-444444444444', 1, 'Whisk lemon juice with olive oil, salt, and black pepper.', NULL),
  ('44000004-0000-4000-8000-000000000003', '44444444-4444-4444-8444-444444444444', 2, 'Combine cucumber, herbs, and crumbled feta in a large bowl.', NULL),
  ('44000004-0000-4000-8000-000000000004', '44444444-4444-4444-8444-444444444444', 3, 'Fold through the warm chickpeas and dressing just before serving.', NULL);

INSERT OR IGNORE INTO tags (id, name, normalized_name, created_at) VALUES
  ('90000001-0000-4000-8000-000000000001', 'Example', 'example', '2026-08-07T12:00:00.000Z'),
  ('90000001-0000-4000-8000-000000000002', 'Vegetarian', 'vegetarian', '2026-08-07T12:00:00.000Z'),
  ('90000001-0000-4000-8000-000000000003', 'Weeknight', 'weeknight', '2026-08-07T12:00:00.000Z'),
  ('90000001-0000-4000-8000-000000000004', 'Breakfast', 'breakfast', '2026-08-07T12:00:00.000Z'),
  ('90000001-0000-4000-8000-000000000005', 'Salad', 'salad', '2026-08-07T12:00:00.000Z');

INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id, position)
SELECT '11111111-1111-4111-8111-111111111111', id, 0 FROM tags WHERE normalized_name = 'example';
INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id, position)
SELECT '11111111-1111-4111-8111-111111111111', id, 1 FROM tags WHERE normalized_name = 'vegetarian';
INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id, position)
SELECT '22222222-2222-4222-8222-222222222222', id, 0 FROM tags WHERE normalized_name = 'example';
INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id, position)
SELECT '22222222-2222-4222-8222-222222222222', id, 1 FROM tags WHERE normalized_name = 'weeknight';
INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id, position)
SELECT '33333333-3333-4333-8333-333333333333', id, 0 FROM tags WHERE normalized_name = 'example';
INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id, position)
SELECT '33333333-3333-4333-8333-333333333333', id, 1 FROM tags WHERE normalized_name = 'breakfast';
INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id, position)
SELECT '44444444-4444-4444-8444-444444444444', id, 0 FROM tags WHERE normalized_name = 'example';
INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id, position)
SELECT '44444444-4444-4444-8444-444444444444', id, 1 FROM tags WHERE normalized_name = 'vegetarian';
INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id, position)
SELECT '44444444-4444-4444-8444-444444444444', id, 2 FROM tags WHERE normalized_name = 'salad';

INSERT INTO recipe_changes (recipe_id, recipe_version, changed_at, deleted)
SELECT r.id, r.version, r.updated_at, 0
FROM recipes r
WHERE r.source_name = 'Recipe App examples'
  AND NOT EXISTS (SELECT 1 FROM recipe_changes c WHERE c.recipe_id = r.id);
