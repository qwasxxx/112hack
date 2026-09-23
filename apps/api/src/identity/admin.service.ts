import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseService } from '../infrastructure/database/database.service';
import { loadEnv } from '../infrastructure/config/env';
import { controlService, type ControllableService } from './docker-control';

const env = loadEnv();

type Probe = { ok: boolean; ready: boolean; latencyMs: number; note: string };

async function probe(url: string): Promise<Probe> {
  const started = Date.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
    const latencyMs = Date.now() - started;
    if (!response.ok) {
      return { ok: false, ready: false, latencyMs, note: `HTTP ${response.status}` };
    }
    const body = (await response.json().catch(() => ({}))) as { status?: string; model?: string };
    const status = typeof body.status === 'string' ? body.status : 'ok';
    const ready = status === 'ok' || status === 'ready';
    const model = typeof body.model === 'string' ? body.model : '';
    const note = !ready
      ? status === 'loading'
        ? `загрузка${model ? ` ${model}` : ''} · ${latencyMs} мс`
        : `${status} · ${latencyMs} мс`
      : `${model ? `${model} · ` : ''}${latencyMs} мс`;
    return { ok: true, ready, latencyMs, note };
  } catch {
    return { ok: false, ready: false, latencyMs: Date.now() - started, note: 'нет ответа' };
  }
}

@Injectable()
export class AdminService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AdminService.name);
  private timer?: ReturnType<typeof setInterval>;
  private readonly backupDir = env.BACKUP_DIR
    ? resolve(env.BACKUP_DIR)
    : resolve(process.cwd(), 'data/backups');

  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  onModuleInit() {
    void this.ensureDailyBackup();
    this.timer = setInterval(() => {
      void this.ensureDailyBackup();
    }, 60 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async status() {
    const postgres = await this.database.ping();
    const [stt, llm, tts] = await Promise.all([
      probe(env.STT_HEALTH_URL),
      probe(env.LLM_HEALTH_URL),
      probe(env.TTS_HEALTH_URL),
    ]);
    const at = new Date().toISOString();
    return {
      at,
      services: [
        { id: 'api', running: true, ready: true, title: 'API', note: 'шлюз отвечает' },
        { id: 'realtime', running: true, ready: true, title: 'Realtime', note: 'сессии вызовов' },
        { id: 'stt', running: stt.ok, ready: stt.ready, latencyMs: stt.latencyMs, title: 'STT', note: stt.note },
        { id: 'llm', running: llm.ok, ready: llm.ready, latencyMs: llm.latencyMs, title: 'LLM', note: llm.note },
        { id: 'tts', running: tts.ok, ready: tts.ready, latencyMs: tts.latencyMs, title: 'TTS', note: tts.note },
        { id: 'postgres', running: postgres, ready: postgres, title: 'PostgreSQL', note: postgres ? 'пинг ок' : 'нет пинга' },
        { id: 'sip', running: false, ready: false, title: 'SIP / VoIP', note: 'не в учебном контуре' },
      ],
    };
  }

  async control(id: string, action: string) {
    if (id === 'sip') {
      return { ok: false, id, action, message: 'SIP не входит в учебный контур' };
    }
    if (action !== 'start' && action !== 'stop') {
      return { ok: false, id, action, message: 'Нужен start или stop' };
    }
    const result = await controlService(id as ControllableService, action);
    return { id, action, ...result };
  }

  async backup(kind: 'manual' | 'scheduled' = 'manual') {
    const sql = this.database.requireSql();
    const users = await sql<
      { id: string; login: string | null; email: string; display_name: string; role: string; deactivated_at: Date | null }[]
    >`SELECT id, login, email, display_name, role, deactivated_at FROM users ORDER BY display_name`;
    const lessons = await sql<{ payload: unknown }[]>`SELECT payload FROM lesson_records ORDER BY completed_at DESC`;
    const assignments = await sql<{ scenario_ids: unknown; teacher_login: string }[]>`
      SELECT scenario_ids, teacher_login FROM assignments WHERE id = 'default'
    `;
    const classState = await sql<{ active: boolean; teacher_login: string; title: string }[]>`
      SELECT active, teacher_login, title FROM class_state WHERE id = 'default'
    `;
    const overlays = await sql<{ lesson_id: string; expert_score: number | null; comment: string | null }[]>`
      SELECT lesson_id, expert_score, comment FROM teacher_overlays
    `;
    const audit = await sql<{ payload: unknown }[]>`SELECT payload FROM teacher_audit ORDER BY created_at DESC LIMIT 200`;
    const snapshot = {
      at: new Date().toISOString(),
      users,
      lessons: lessons.map((row) => row.payload),
      assignments: assignments[0] ?? null,
      classState: classState[0] ?? null,
      overlays,
      audit: audit.map((row) => row.payload),
    };
    await this.writeSnapshot(snapshot, kind);
    return snapshot;
  }

  async backupStatus() {
    const latest = await this.latestBackupFile();
    return {
      dir: this.backupDir,
      lastAt: latest?.at ?? null,
      lastFile: latest?.name ?? null,
    };
  }

  async listAudit() {
    const sql = this.database.requireSql();
    const rows = await sql<{ id: string; action: string; entity_type: string; entity_id: string; payload: unknown; created_at: Date }[]>`
      SELECT id, action, entity_type, entity_id, payload, created_at
      FROM audit_log
      ORDER BY created_at DESC
      LIMIT 200
    `;
    return rows.map((row) => ({
      id: row.id,
      at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      action: row.action,
      target: `${row.entity_type}:${row.entity_id}`,
      payload: row.payload,
    }));
  }

  private async ensureDailyBackup() {
    try {
      const latest = await this.latestBackupFile();
      const today = new Date().toISOString().slice(0, 10);
      if (latest?.at.slice(0, 10) === today) {
        return;
      }
      const snapshot = await this.backup('scheduled');
      this.logger.log(`daily backup ${snapshot.at}`);
    } catch (error) {
      this.logger.warn(`backup skipped: ${error instanceof Error ? error.message : error}`);
    }
  }

  private async writeSnapshot(snapshot: { at: string }, kind: 'manual' | 'scheduled') {
    await mkdir(this.backupDir, { recursive: true });
    const stamp = snapshot.at.slice(0, 19).replace(/[:T]/g, '-');
    const name = `sys112-${kind}-${stamp}.json`;
    await writeFile(resolve(this.backupDir, name), JSON.stringify(snapshot), 'utf8');
  }

  private async latestBackupFile(): Promise<{ name: string; at: string } | null> {
    try {
      const names = (await readdir(this.backupDir)).filter((name) => name.endsWith('.json')).sort();
      const name = names.at(-1);
      if (!name) {
        return null;
      }
      const match = name.match(/(\d{4}-\d{2}-\d{2})/);
      return { name, at: match ? `${match[1]}T00:00:00.000Z` : '' };
    } catch {
      return null;
    }
  }
}
