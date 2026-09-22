CREATE TABLE IF NOT EXISTS call_recordings (
  id uuid PRIMARY KEY,
  lesson_id text,
  operator_login text NOT NULL,
  scenario_id text NOT NULL DEFAULT '',
  mime text NOT NULL DEFAULT 'audio/wav',
  duration_sec integer NOT NULL DEFAULT 0,
  bytes bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS call_recordings_login_idx ON call_recordings (operator_login, created_at DESC);
CREATE INDEX IF NOT EXISTS call_recordings_lesson_idx ON call_recordings (lesson_id);

CREATE TABLE IF NOT EXISTS ticket_catalog (
  id text PRIMARY KEY,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO ticket_catalog (id, payload)
VALUES ('default', '{"overlays":{},"custom":[]}'::jsonb)
ON CONFLICT (id) DO NOTHING;
