-- One-time authorized production reset for 2026-08-10.
-- Existing active recipes receive sync tombstones before their child data is removed.

INSERT INTO recipe_changes (recipe_id, recipe_version, changed_at, deleted)
SELECT id, version + 1, '2026-08-10T11:30:00.000Z', 1
FROM recipes
WHERE deleted_at IS NULL
  AND id NOT IN ('a1111111-1111-4111-8111-111111111111', 'b2222222-2222-4222-8222-222222222222');

UPDATE recipes
SET deleted_at = '2026-08-10T11:30:00.000Z', updated_at = '2026-08-10T11:30:00.000Z', version = version + 1
WHERE deleted_at IS NULL
  AND id NOT IN ('a1111111-1111-4111-8111-111111111111', 'b2222222-2222-4222-8222-222222222222');

DELETE FROM recipe_tags WHERE recipe_id NOT IN ('a1111111-1111-4111-8111-111111111111', 'b2222222-2222-4222-8222-222222222222');
DELETE FROM ingredients WHERE recipe_id NOT IN ('a1111111-1111-4111-8111-111111111111', 'b2222222-2222-4222-8222-222222222222');
DELETE FROM instructions WHERE recipe_id NOT IN ('a1111111-1111-4111-8111-111111111111', 'b2222222-2222-4222-8222-222222222222');
DELETE FROM tags WHERE NOT EXISTS (SELECT 1 FROM recipe_tags WHERE recipe_tags.tag_id = tags.id);

UPDATE recipe_images
SET deleted_at = '2026-08-10T11:30:00.000Z'
WHERE id NOT IN ('a1111111-aaaa-4111-8111-111111111111', 'b2222222-bbbb-4222-8222-222222222222') AND deleted_at IS NULL;

INSERT INTO recipe_images (id, object_key, content_type, width, height, byte_size, checksum_sha256, created_at, deleted_at) VALUES
  ('a1111111-aaaa-4111-8111-111111111111', 'covers/a1111111-aaaa-4111-8111-111111111111.webp', 'image/webp', 1448, 1086, 295540, '337132859f728655410e36c5df43cff5647442721adfc5c70317d0560cb2542d', '2026-08-10T11:30:00.000Z', NULL),
  ('b2222222-bbbb-4222-8222-222222222222', 'covers/b2222222-bbbb-4222-8222-222222222222.webp', 'image/webp', 1448, 1086, 182726, 'eda3dc0299c180dee6f6a2160ecd4de152e2cb845780cb03dabd503f92e10c61', '2026-08-10T11:31:00.000Z', NULL)
ON CONFLICT(id) DO UPDATE SET object_key = excluded.object_key, content_type = excluded.content_type, width = excluded.width,
  height = excluded.height, byte_size = excluded.byte_size, checksum_sha256 = excluded.checksum_sha256, deleted_at = NULL;

INSERT INTO recipes (
  id, title, description, servings, prep_minutes, cook_minutes, source_type,
  source_name, source_url, image_key, notes, favorite, version, created_at, updated_at, deleted_at
) VALUES
  ('a1111111-1111-4111-8111-111111111111', 'Laxskål med miso och pärlkorn', 'En frisk och mättande skål med misolax, pärlkorn, krispiga grönsaker och lime.', 4, 20, 25, 'personal', 'Exempelrecept', NULL, 'a1111111-aaaa-4111-8111-111111111111', 'Pärlkornet kan kokas dagen innan och förvaras i kylskåp.', 1, 1, '2026-08-10T11:30:00.000Z', '2026-08-10T11:30:00.000Z', NULL),
  ('b2222222-2222-4222-8222-222222222222', 'Grön ärtsoppa med dill', 'Len svensk ärtsoppa med crème fraîche, färska örter och rostat rågbröd.', 4, 10, 20, 'personal', 'Exempelrecept', NULL, 'b2222222-bbbb-4222-8222-222222222222', 'Spara lite crème fraîche och örter till serveringen.', 0, 1, '2026-08-10T11:31:00.000Z', '2026-08-10T11:31:00.000Z', NULL)
ON CONFLICT(id) DO UPDATE SET title = excluded.title, description = excluded.description, servings = excluded.servings,
  prep_minutes = excluded.prep_minutes, cook_minutes = excluded.cook_minutes, source_type = excluded.source_type,
  source_name = excluded.source_name, source_url = excluded.source_url, image_key = excluded.image_key, notes = excluded.notes,
  favorite = excluded.favorite, version = excluded.version, updated_at = excluded.updated_at, deleted_at = NULL;

DELETE FROM recipe_tags WHERE recipe_id IN ('a1111111-1111-4111-8111-111111111111', 'b2222222-2222-4222-8222-222222222222');
DELETE FROM ingredients WHERE recipe_id IN ('a1111111-1111-4111-8111-111111111111', 'b2222222-2222-4222-8222-222222222222');
DELETE FROM instructions WHERE recipe_id IN ('a1111111-1111-4111-8111-111111111111', 'b2222222-2222-4222-8222-222222222222');

INSERT INTO ingredients (id, recipe_id, position, amount, unit, name, group_name, catalog_id) VALUES
  ('a1000001-0000-4000-8000-000000000001', 'a1111111-1111-4111-8111-111111111111', 0, '600', 'g', 'Lax', NULL, '50000001-0000-4000-8000-000000000019'),
  ('a1000001-0000-4000-8000-000000000002', 'a1111111-1111-4111-8111-111111111111', 1, '3', 'dl', 'Pärlkorn', NULL, '50000001-0000-4000-8000-000000000029'),
  ('a1000001-0000-4000-8000-000000000003', 'a1111111-1111-4111-8111-111111111111', 2, '2', 'msk', 'Misopasta', 'Glaze', '50000001-0000-4000-8000-000000000035'),
  ('a1000001-0000-4000-8000-000000000004', 'a1111111-1111-4111-8111-111111111111', 3, '1,5', 'msk', 'Sojasås', 'Glaze', '50000001-0000-4000-8000-000000000034'),
  ('a1000001-0000-4000-8000-000000000005', 'a1111111-1111-4111-8111-111111111111', 4, '1', 'msk', 'Honung', 'Glaze', '50000001-0000-4000-8000-000000000036'),
  ('a1000001-0000-4000-8000-000000000006', 'a1111111-1111-4111-8111-111111111111', 5, '1', 'st', 'Lime', 'Glaze', '50000001-0000-4000-8000-000000000018'),
  ('a1000001-0000-4000-8000-000000000007', 'a1111111-1111-4111-8111-111111111111', 6, '1', 'st', 'Gurka', NULL, '50000001-0000-4000-8000-000000000010'),
  ('a1000001-0000-4000-8000-000000000008', 'a1111111-1111-4111-8111-111111111111', 7, '2', 'st', 'Avokado', NULL, '50000001-0000-4000-8000-000000000016'),
  ('a1000001-0000-4000-8000-000000000009', 'a1111111-1111-4111-8111-111111111111', 8, '2', 'dl', 'Edamame', NULL, '50000001-0000-4000-8000-000000000015'),
  ('a1000001-0000-4000-8000-000000000010', 'a1111111-1111-4111-8111-111111111111', 9, '3', 'st', 'Salladslök', NULL, '50000001-0000-4000-8000-000000000006'),
  ('a1000001-0000-4000-8000-000000000011', 'a1111111-1111-4111-8111-111111111111', 10, '1', 'msk', 'Sesamfrö', NULL, '50000001-0000-4000-8000-000000000045'),
  ('a1000001-0000-4000-8000-000000000012', 'a1111111-1111-4111-8111-111111111111', 11, NULL, NULL, 'Salt', NULL, '50000001-0000-4000-8000-000000000042'),
  ('b2000002-0000-4000-8000-000000000001', 'b2222222-2222-4222-8222-222222222222', 0, '500', 'g', 'Gröna ärtor', NULL, '50000001-0000-4000-8000-000000000014'),
  ('b2000002-0000-4000-8000-000000000002', 'b2222222-2222-4222-8222-222222222222', 1, '1', 'st', 'Gul lök', NULL, '50000001-0000-4000-8000-000000000003'),
  ('b2000002-0000-4000-8000-000000000003', 'b2222222-2222-4222-8222-222222222222', 2, '2', 'st', 'Vitlök', NULL, '50000001-0000-4000-8000-000000000005'),
  ('b2000002-0000-4000-8000-000000000004', 'b2222222-2222-4222-8222-222222222222', 3, '8', 'dl', 'Grönsaksbuljong', NULL, '50000001-0000-4000-8000-000000000037'),
  ('b2000002-0000-4000-8000-000000000005', 'b2222222-2222-4222-8222-222222222222', 4, '1', 'dl', 'Crème fraîche', NULL, '50000001-0000-4000-8000-000000000025'),
  ('b2000002-0000-4000-8000-000000000006', 'b2222222-2222-4222-8222-222222222222', 5, '1', 'msk', 'Smör', NULL, '50000001-0000-4000-8000-000000000024'),
  ('b2000002-0000-4000-8000-000000000007', 'b2222222-2222-4222-8222-222222222222', 6, '1', 'dl', 'Dill', NULL, '50000001-0000-4000-8000-000000000040'),
  ('b2000002-0000-4000-8000-000000000008', 'b2222222-2222-4222-8222-222222222222', 7, '0,5', 'dl', 'Gräslök', NULL, '50000001-0000-4000-8000-000000000041'),
  ('b2000002-0000-4000-8000-000000000009', 'b2222222-2222-4222-8222-222222222222', 8, NULL, NULL, 'Salt', NULL, '50000001-0000-4000-8000-000000000042'),
  ('b2000002-0000-4000-8000-000000000010', 'b2222222-2222-4222-8222-222222222222', 9, NULL, NULL, 'Svartpeppar', NULL, '50000001-0000-4000-8000-000000000043'),
  ('b2000002-0000-4000-8000-000000000011', 'b2222222-2222-4222-8222-222222222222', 10, '4', 'st', 'Rågbröd', 'Servering', '50000001-0000-4000-8000-000000000030');

INSERT INTO instructions (id, recipe_id, position, text, timer_seconds) VALUES
  ('a1100001-0000-4000-8000-000000000001', 'a1111111-1111-4111-8111-111111111111', 0, 'Koka pärlkornet enligt anvisningen på förpackningen. Häll av och håll varmt.', NULL),
  ('a1100001-0000-4000-8000-000000000002', 'a1111111-1111-4111-8111-111111111111', 1, 'Blanda misopasta, sojasås, honung och saften från halva limen. Pensla laxen med glazen.', NULL),
  ('a1100001-0000-4000-8000-000000000003', 'a1111111-1111-4111-8111-111111111111', 2, 'Tillaga laxen i 200 °C tills den precis faller isär och glazen har karamelliserats.', 900),
  ('a1100001-0000-4000-8000-000000000004', 'a1111111-1111-4111-8111-111111111111', 3, 'Skiva gurka, avokado och salladslök. Fördela pärlkorn, grönsaker och edamame i fyra skålar.', NULL),
  ('a1100001-0000-4000-8000-000000000005', 'a1111111-1111-4111-8111-111111111111', 4, 'Lägg på laxen och avsluta med sesamfrö och resterande lime.', NULL),
  ('b2200002-0000-4000-8000-000000000001', 'b2222222-2222-4222-8222-222222222222', 0, 'Hacka lök och vitlök. Fräs dem mjuka i smöret utan att de tar färg.', 300),
  ('b2200002-0000-4000-8000-000000000002', 'b2222222-2222-4222-8222-222222222222', 1, 'Tillsätt ärtor och grönsaksbuljong. Koka upp och sjud tills ärtorna är genomvarma.', 480),
  ('b2200002-0000-4000-8000-000000000003', 'b2222222-2222-4222-8222-222222222222', 2, 'Tillsätt dill och hälften av crème fraîchen. Mixa soppan helt slät.', NULL),
  ('b2200002-0000-4000-8000-000000000004', 'b2222222-2222-4222-8222-222222222222', 3, 'Smaka av med salt och svartpeppar. Servera med crème fraîche, gräslök och rostat rågbröd.', NULL);

INSERT INTO tags (id, name, normalized_name, created_at) VALUES
  ('c0000001-0000-4000-8000-000000000001', 'Vardag', 'vardag', '2026-08-10T11:30:00.000Z'),
  ('c0000001-0000-4000-8000-000000000002', 'Fisk', 'fisk', '2026-08-10T11:30:00.000Z'),
  ('c0000001-0000-4000-8000-000000000003', 'Vegetariskt', 'vegetariskt', '2026-08-10T11:31:00.000Z'),
  ('c0000001-0000-4000-8000-000000000004', 'Soppa', 'soppa', '2026-08-10T11:31:00.000Z')
ON CONFLICT(normalized_name) DO UPDATE SET name = excluded.name;

INSERT INTO recipe_tags (recipe_id, tag_id, position) VALUES
  ('a1111111-1111-4111-8111-111111111111', 'c0000001-0000-4000-8000-000000000001', 0),
  ('a1111111-1111-4111-8111-111111111111', 'c0000001-0000-4000-8000-000000000002', 1),
  ('b2222222-2222-4222-8222-222222222222', 'c0000001-0000-4000-8000-000000000001', 0),
  ('b2222222-2222-4222-8222-222222222222', 'c0000001-0000-4000-8000-000000000003', 1),
  ('b2222222-2222-4222-8222-222222222222', 'c0000001-0000-4000-8000-000000000004', 2);

INSERT INTO recipe_changes (recipe_id, recipe_version, changed_at, deleted) VALUES
  ('a1111111-1111-4111-8111-111111111111', 1, '2026-08-10T11:30:00.000Z', 0),
  ('b2222222-2222-4222-8222-222222222222', 1, '2026-08-10T11:31:00.000Z', 0);
