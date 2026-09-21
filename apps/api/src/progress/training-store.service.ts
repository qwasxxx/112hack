import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../infrastructure/database/database.service';

function toIso(value: Date | string | null | undefined): string {
  if (!value) {
    return '';
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function asJson(value: unknown): string {
  return JSON.stringify(value ?? {});
}

@Injectable()
export class TrainingStoreService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  health() {
    return {
      status: this.database.status,
      error: this.database.lastError ?? null,
    };
  }

  async listLessons() {
    const sql = this.database.requireSql();
    const rows = await sql<{ payload: unknown }[]>`
      SELECT payload FROM lesson_records ORDER BY completed_at DESC
    `;
    return rows.map((row) => row.payload);
  }

  async upsertLesson(id: string, login: string, payload: unknown) {
    const sql = this.database.requireSql();
    const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const completedAt =
      typeof record.completedAt === 'string' ? record.completedAt : new Date().toISOString();
    await sql`
      INSERT INTO lesson_records (id, operator_login, payload, completed_at)
      VALUES (${id}, ${login}, ${asJson(record)}::jsonb, ${completedAt})
      ON CONFLICT (id) DO UPDATE SET
        operator_login = EXCLUDED.operator_login,
        payload = EXCLUDED.payload,
        completed_at = EXCLUDED.completed_at
    `;
    return { ok: true, id };
  }

  async getAssignments() {
    const sql = this.database.requireSql();
    const [row] = await sql<{
      scenario_ids: string[] | string;
      teacher_login: string;
      updated_at: Date | string;
    }[]>`SELECT scenario_ids, teacher_login, updated_at FROM assignments WHERE id = 'default'`;
    if (!row) {
      return { configured: false, scenarioIds: [] as string[], teacherLogin: 'petrov', updatedAt: null };
    }
    const scenarioIds = Array.isArray(row.scenario_ids)
      ? row.scenario_ids
      : typeof row.scenario_ids === 'string'
        ? (JSON.parse(row.scenario_ids) as string[])
        : [];
    return {
      configured: true,
      scenarioIds,
      teacherLogin: row.teacher_login,
      updatedAt: toIso(row.updated_at) || null,
    };
  }

  async putAssignments(scenarioIds: string[], teacherLogin: string) {
    const sql = this.database.requireSql();
    await sql`
      INSERT INTO assignments (id, scenario_ids, teacher_login, updated_at)
      VALUES ('default', ${asJson(scenarioIds)}::jsonb, ${teacherLogin}, now())
      ON CONFLICT (id) DO UPDATE SET
        scenario_ids = EXCLUDED.scenario_ids,
        teacher_login = EXCLUDED.teacher_login,
        updated_at = now()
    `;
    return { ok: true, scenarioIds };
  }

  async getClass() {
    const sql = this.database.requireSql();
    const [row] = await sql<{
      active: boolean;
      started_at: Date | string | null;
      teacher_login: string;
      title: string;
    }[]>`SELECT active, started_at, teacher_login, title FROM class_state WHERE id = 'default'`;
    return {
      active: Boolean(row?.active),
      startedAt: toIso(row?.started_at),
      teacherLogin: row?.teacher_login ?? '',
      title: row?.title ?? '',
    };
  }

  async putClass(input: {
    active?: boolean;
    startedAt?: string;
    teacherLogin?: string;
    title?: string;
  }) {
    const sql = this.database.requireSql();
    const active = Boolean(input.active);
    const startedAt = input.startedAt ? toIso(input.startedAt) || null : null;
    await sql`
      INSERT INTO class_state (id, active, started_at, teacher_login, title, updated_at)
      VALUES (
        'default',
        ${active},
        ${startedAt},
        ${input.teacherLogin || ''},
        ${input.title || ''},
        now()
      )
      ON CONFLICT (id) DO UPDATE SET
        active = EXCLUDED.active,
        started_at = EXCLUDED.started_at,
        teacher_login = EXCLUDED.teacher_login,
        title = EXCLUDED.title,
        updated_at = now()
    `;
    return this.getClass();
  }

  async getOverlays() {
    const sql = this.database.requireSql();
    const rows = await sql<{ lesson_id: string; expert_score: number | null; comment: string | null }[]>`
      SELECT lesson_id, expert_score, comment FROM teacher_overlays
    `;
    const map: Record<string, { expertScore?: number; comment?: string }> = {};
    for (const row of rows) {
      map[row.lesson_id] = {
        expertScore: row.expert_score ?? undefined,
        comment: row.comment ?? undefined,
      };
    }
    return map;
  }

  async putOverlay(lessonId: string, body: { expertScore?: number; comment?: string }) {
    const sql = this.database.requireSql();
    await sql`
      INSERT INTO teacher_overlays (lesson_id, expert_score, comment, updated_at)
      VALUES (${lessonId}, ${body.expertScore ?? null}, ${body.comment ?? null}, now())
      ON CONFLICT (lesson_id) DO UPDATE SET
        expert_score = COALESCE(EXCLUDED.expert_score, teacher_overlays.expert_score),
        comment = COALESCE(EXCLUDED.comment, teacher_overlays.comment),
        updated_at = now()
    `;
    return { ok: true, lessonId };
  }

  async listAudit() {
    const sql = this.database.requireSql();
    const rows = await sql<{ payload: unknown }[]>`
      SELECT payload FROM teacher_audit ORDER BY created_at DESC LIMIT 200
    `;
    return rows.map((row) => row.payload);
  }

  async putAudit(id: string, payload: Record<string, unknown>) {
    const sql = this.database.requireSql();
    await sql`
      INSERT INTO teacher_audit (id, payload)
      VALUES (${id}, ${asJson(payload)}::jsonb)
      ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload
    `;
    return { ok: true, id };
  }

  async listLive() {
    const sql = this.database.requireSql();
    const rows = await sql<{ payload: unknown }[]>`
      SELECT payload FROM live_presence
      WHERE updated_at > now() - interval '45 seconds'
    `;
    return rows.map((row) => row.payload);
  }

  async upsertLive(login: string, payload: unknown) {
    const sql = this.database.requireSql();
    await sql`
      INSERT INTO live_presence (login, payload, updated_at)
      VALUES (${login}, ${asJson(payload)}::jsonb, now())
      ON CONFLICT (login) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()
    `;
    return { ok: true, login };
  }

  async deleteLive(login: string) {
    const sql = this.database.requireSql();
    await sql`DELETE FROM live_presence WHERE login = ${login}`;
    return { ok: true, login };
  }
}
