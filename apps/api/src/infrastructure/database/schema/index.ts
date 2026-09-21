import { pgTable, uuid, text, timestamp, integer, jsonb, boolean, uniqueIndex, index } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  role: text('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
  login: text('login'),
}, (table) => ({
  emailIdx: uniqueIndex('users_email_idx').on(table.email),
  loginIdx: uniqueIndex('users_login_idx').on(table.login),
}));

export const courses = pgTable('courses', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lessons = pgTable('lessons', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').notNull().references(() => courses.id),
  title: text('title').notNull(),
  theory: text('theory').notNull().default(''),
  position: integer('position').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const scenarios = pgTable('scenarios', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  slugIdx: uniqueIndex('scenarios_slug_idx').on(table.slug),
}));

export const scenarioVersions = pgTable('scenario_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  scenarioId: uuid('scenario_id').notNull().references(() => scenarios.id),
  version: integer('version').notNull(),
  status: text('status').notNull(),
  definition: jsonb('definition').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  scenarioVersionIdx: uniqueIndex('scenario_versions_unique').on(table.scenarioId, table.version),
}));

export const calls = pgTable('calls', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').notNull().references(() => users.id),
  scenarioVersionId: uuid('scenario_version_id').notNull().references(() => scenarioVersions.id),
  status: text('status').notNull(),
  runtimeState: jsonb('runtime_state').notNull(),
  stateVersion: integer('state_version').notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
}, (table) => ({
  studentIdx: index('calls_student_idx').on(table.studentId),
  statusIdx: index('calls_status_idx').on(table.status),
}));

export const transcriptSegments = pgTable('transcript_segments', {
  id: uuid('id').primaryKey().defaultRandom(),
  callId: uuid('call_id').notNull().references(() => calls.id),
  role: text('role').notNull(),
  text: text('text').notNull(),
  isFinal: boolean('is_final').notNull().default(false),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
}, (table) => ({
  callIdx: index('transcript_call_idx').on(table.callId),
}));

export const incidentCards = pgTable('incident_cards', {
  id: uuid('id').primaryKey().defaultRandom(),
  callId: uuid('call_id').notNull().references(() => calls.id),
  schemaVersion: text('schema_version').notNull(),
  payload: jsonb('payload').notNull(),
  version: integer('version').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  callUnique: uniqueIndex('incident_cards_call_idx').on(table.callId),
}));

export const teacherInterventions = pgTable('teacher_interventions', {
  id: uuid('id').primaryKey().defaultRandom(),
  callId: uuid('call_id').notNull().references(() => calls.id),
  teacherId: uuid('teacher_id').notNull().references(() => users.id),
  type: text('type').notNull(),
  params: jsonb('params').notNull(),
  effect: jsonb('effect').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  callIdx: index('interventions_call_idx').on(table.callId),
}));

export const evaluations = pgTable('evaluations', {
  id: uuid('id').primaryKey().defaultRandom(),
  callId: uuid('call_id').notNull().references(() => calls.id),
  rulesVersion: text('rules_version').notNull(),
  result: jsonb('result').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  callIdx: index('evaluations_call_idx').on(table.callId),
}));

export const knowledgeDocuments = pgTable('knowledge_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  kind: text('kind').notNull(),
  sourceUri: text('source_uri'),
  checksum: text('checksum').notNull(),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const knowledgeChunks = pgTable('knowledge_chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id').notNull().references(() => knowledgeDocuments.id),
  ordinal: integer('ordinal').notNull(),
  content: text('content').notNull(),
  metadata: jsonb('metadata').notNull(),
  embedding: text('embedding'),
}, (table) => ({
  documentIdx: index('chunks_document_idx').on(table.documentId),
}));

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id').references(() => users.id),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  entityIdx: index('audit_entity_idx').on(table.entityType, table.entityId),
}));

export const trainingProgress = pgTable('training_progress', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').notNull().references(() => users.id),
  scenarioId: uuid('scenario_id').notNull().references(() => scenarios.id),
  attempts: integer('attempts').notNull().default(0),
  bestScore: integer('best_score'),
  lastCallId: uuid('last_call_id').references(() => calls.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  uniqueProgress: uniqueIndex('progress_student_scenario').on(table.studentId, table.scenarioId),
}));
