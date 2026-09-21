CREATE TABLE IF NOT EXISTS schema_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lesson_records (
  id uuid PRIMARY KEY,
  operator_login text NOT NULL,
  payload jsonb NOT NULL,
  completed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lesson_records_login_idx ON lesson_records (operator_login);
CREATE INDEX IF NOT EXISTS lesson_records_completed_idx ON lesson_records (completed_at DESC);

CREATE TABLE IF NOT EXISTS assignments (
  id text PRIMARY KEY,
  scenario_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  teacher_login text NOT NULL DEFAULT 'petrov',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS class_state (
  id text PRIMARY KEY,
  active boolean NOT NULL DEFAULT false,
  started_at timestamptz,
  teacher_login text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teacher_overlays (
  lesson_id text PRIMARY KEY,
  expert_score integer,
  comment text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teacher_audit (
  id text PRIMARY KEY,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS live_presence (
  login text PRIMARY KEY,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS login text;
CREATE UNIQUE INDEX IF NOT EXISTS users_login_idx ON users (login) WHERE login IS NOT NULL;

INSERT INTO assignments (id, scenario_ids, teacher_login, updated_at)
VALUES (
  'default',
  '["ags-01-1","ags-01-2","ags-01-3","ags-02-1","ags-02-2","ags-02-3","ags-03-1","ags-03-2"]'::jsonb,
  'petrov',
  now()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO class_state (id, active, teacher_login, title)
VALUES ('default', false, '', '')
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (email, password_hash, display_name, role, login)
VALUES
  ('volkova@sys112.local', crypt('112', gen_salt('bf')), 'Волкова М. И.', 'ADMIN', 'volkova'),
  ('petrov@sys112.local', crypt('112', gen_salt('bf')), 'Петров Д. А.', 'TEACHER', 'petrov'),
  ('smirnova@sys112.local', crypt('112', gen_salt('bf')), 'Смирнова А. С.', 'STUDENT', 'smirnova')
ON CONFLICT (email) DO UPDATE
  SET login = EXCLUDED.login,
      display_name = EXCLUDED.display_name,
      role = EXCLUDED.role,
      updated_at = now();
