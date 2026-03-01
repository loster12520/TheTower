CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  schema_version TEXT NOT NULL,
  steps_json TEXT NOT NULL,
  other_step_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  stats_step_count INTEGER NOT NULL,
  last_run_json TEXT
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  status TEXT NOT NULL,
  current_step_id TEXT,
  started_at TEXT,
  finished_at TEXT,
  error_json TEXT
);
