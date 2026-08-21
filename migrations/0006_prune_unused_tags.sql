DELETE FROM recipe_tags
WHERE recipe_id IN (SELECT id FROM recipes WHERE deleted_at IS NOT NULL);

DELETE FROM tags
WHERE NOT EXISTS (SELECT 1 FROM recipe_tags WHERE recipe_tags.tag_id = tags.id);

CREATE TRIGGER prune_tag_after_recipe_tag_delete
AFTER DELETE ON recipe_tags
BEGIN
  DELETE FROM tags
  WHERE id = OLD.tag_id
    AND NOT EXISTS (SELECT 1 FROM recipe_tags WHERE recipe_tags.tag_id = OLD.tag_id);
END;

CREATE TRIGGER remove_tags_from_soft_deleted_recipe
AFTER UPDATE OF deleted_at ON recipes
WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
BEGIN
  DELETE FROM recipe_tags WHERE recipe_id = NEW.id;
END;
