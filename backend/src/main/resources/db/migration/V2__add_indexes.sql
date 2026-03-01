CREATE INDEX IF NOT EXISTS idx_templates_updated_at ON templates(updated_at);
CREATE INDEX IF NOT EXISTS idx_runs_template_id ON runs(template_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at);
