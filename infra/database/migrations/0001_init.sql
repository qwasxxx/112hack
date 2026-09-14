CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('STUDENT', 'TEACHER', 'ADMIN')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz
);
CREATE UNIQUE INDEX users_email_idx ON users (email);

CREATE TABLE courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses (id),
  title text NOT NULL,
  theory text NOT NULL DEFAULT '',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX scenarios_slug_idx ON scenarios (slug);

CREATE TABLE scenario_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id uuid NOT NULL REFERENCES scenarios (id),
  version integer NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  definition jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX scenario_versions_unique ON scenario_versions (scenario_id, version);

CREATE TABLE calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES users (id),
  scenario_version_id uuid NOT NULL REFERENCES scenario_versions (id),
  status text NOT NULL CHECK (status IN ('pending', 'live', 'ending', 'completed', 'failed', 'cancelled')),
  runtime_state jsonb NOT NULL,
  state_version integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE INDEX calls_student_idx ON calls (student_id);
CREATE INDEX calls_status_idx ON calls (status);

CREATE TABLE transcript_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES calls (id),
  role text NOT NULL CHECK (role IN ('student', 'caller', 'system')),
  text text NOT NULL,
  is_final boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL,
  ended_at timestamptz
);
CREATE INDEX transcript_call_idx ON transcript_segments (call_id);

CREATE TABLE incident_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES calls (id),
  schema_version text NOT NULL,
  payload jsonb NOT NULL,
  version integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX incident_cards_call_idx ON incident_cards (call_id);

CREATE TABLE teacher_interventions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES calls (id),
  teacher_id uuid NOT NULL REFERENCES users (id),
  type text NOT NULL,
  params jsonb NOT NULL,
  effect jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX interventions_call_idx ON teacher_interventions (call_id);

CREATE TABLE evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES calls (id),
  rules_version text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX evaluations_call_idx ON evaluations (call_id);

CREATE TABLE knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  kind text NOT NULL,
  source_uri text,
  checksum text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES knowledge_documents (id),
  ordinal integer NOT NULL,
  content text NOT NULL,
  metadata jsonb NOT NULL,
  embedding vector(1536)
);
CREATE INDEX chunks_document_idx ON knowledge_chunks (document_id);

CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users (id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_entity_idx ON audit_log (entity_type, entity_id);

CREATE TABLE training_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES users (id),
  scenario_id uuid NOT NULL REFERENCES scenarios (id),
  attempts integer NOT NULL DEFAULT 0,
  best_score integer,
  last_call_id uuid REFERENCES calls (id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX progress_student_scenario ON training_progress (student_id, scenario_id);
