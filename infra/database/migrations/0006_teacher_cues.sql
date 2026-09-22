CREATE TABLE IF NOT EXISTS teacher_cues (
  id text PRIMARY KEY,
  operator_login text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS teacher_cues_login_idx ON teacher_cues (operator_login, created_at DESC);
