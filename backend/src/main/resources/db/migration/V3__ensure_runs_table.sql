CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  status TEXT NOT NULL,
  current_step_id TEXT,
  started_at TEXT,
  finished_at TEXT,
  error_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_runs_template_id ON runs(template_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at);
