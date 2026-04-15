ALTER TABLE templates ADD COLUMN group_name TEXT;
ALTER TABLE templates ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';