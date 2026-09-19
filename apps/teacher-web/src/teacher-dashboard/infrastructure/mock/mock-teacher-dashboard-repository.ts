import type { InterventionType } from '@sys112/shared-types';
import type { TeacherDashboardRepository } from '../../application/ports/teacher-dashboard-repository';
import type {
  ActiveSession,
  AuditRecord,
  CompletedResult,
  InterventionInput,
  Scenario,
  ScenarioDraft,
} from '../../domain/entities';
import {
  auditSeed,
  materialsSeed,
  MOCK_ERROR_ENABLED,
  resultsSeed,
  scenariosSeed,
  sessionsSeed,
  snapshotSeed,
} from './mock-data';

const wait = () => new Promise<void>((resolve) => window.setTimeout(resolve, 280));
const clone = <T>(value: T): T => structuredClone(value);

export class MockTeacherDashboardRepository implements TeacherDashboardRepository {
  private sessions = clone(sessionsSeed);
  private scenarios = clone(scenariosSeed);
  private results = clone(resultsSeed);
  private audit = clone(auditSeed);

  private async ready() {
    await wait();
    if (MOCK_ERROR_ENABLED) throw new Error('Управляемая ошибка mock-репозитория');
  }

  async getDashboardSnapshot() {
    await this.ready();
    return clone(snapshotSeed);
  }
  async getActiveSessions() {
    await this.ready();
    return clone(this.sessions);
  }
  async getSession(callId: string) {
    await this.ready();
    return clone(this.sessions.find((item) => item.callId === callId) ?? null);
  }
  async getScenarios() {
    await this.ready();
    return clone(this.scenarios);
  }
  async getMaterials() {
    await this.ready();
    return clone(materialsSeed);
  }
  async getResults() {
    await this.ready();
    return clone(this.results);
  }
  async getAudit() {
    await this.ready();
    return clone(this.audit);
  }

  async saveScenario(draft: ScenarioDraft): Promise<Scenario> {
    await this.ready();
    const existing = draft.id ? this.scenarios.find((item) => item.id === draft.id) : undefined;
    const saved: Scenario = {
      ...draft,
      id: existing?.id ?? `sc-${this.scenarios.length + 1}`,
      version: existing ? existing.version + 1 : 1,
      status: existing?.status ?? 'draft',
      assignments: existing?.assignments ?? 0,
      updatedAt: new Date().toISOString(),
    };
    this.scenarios = existing
      ? this.scenarios.map((item) => (item.id === saved.id ? saved : item))
      : [...this.scenarios, saved];
    return clone(saved);
  }

  async setScenarioArchived(id: string, archived: boolean) {
    await this.ready();
    const current = this.scenarios.find((item) => item.id === id);
    if (!current) throw new Error('Сценарий не найден');
    const saved: Scenario = {
      ...current,
      status: archived ? 'archived' : 'draft',
      updatedAt: new Date().toISOString(),
    };
    this.scenarios = this.scenarios.map((item) => (item.id === id ? saved : item));
    return clone(saved);
  }

  async saveExpertComment(resultId: string, comment: string) {
    await this.ready();
    return this.updateResult(resultId, (result) => ({ ...result, teacherComment: comment }));
  }

  async adjustExpertScore(resultId: string, score: number, reason: string) {
    await this.ready();
    if (!reason.trim()) throw new Error('Укажите причину корректировки');
    const before = this.results.find((item) => item.id === resultId);
    if (!before) throw new Error('Результат не найден');
    const updated = this.updateResult(resultId, (result) => ({
      ...result,
      expertScore: score,
      finalScore: Math.round((result.automaticScore + score) / 2),
    }));
    this.audit = [
      {
        id: `audit-${Date.now()}`,
        at: new Date().toISOString(),
        actor: snapshotSeed.teacher.name,
        action: 'Корректировка экспертной оценки',
        entityId: resultId,
        previousValue: String(before.expertScore),
        newValue: String(score),
        reason,
        mock: true,
      },
      ...this.audit,
    ];
    return updated;
  }

  async applyIntervention(input: InterventionInput) {
    await this.ready();
    const current = this.sessions.find((item) => item.callId === input.callId);
    if (!current) throw new Error('Сессия не найдена');
    const titles: Record<InterventionType, string> = {
      set_emotional_state: 'Изменено эмоциональное состояние',
      add_circumstance: 'Добавлено обстоятельство',
      reveal_fact: 'Открыт факт',
      conceal_fact: 'Скрыт факт',
      force_state: 'Изменено состояние сценария',
      inject_event: 'Добавлено внезапное событие',
      adjust_difficulty: 'Изменена сложность',
      end_call: 'Вызов завершён',
    };
    const updated: ActiveSession = {
      ...current,
      status: input.type === 'end_call' ? 'finishing' : current.status,
      timeline: [
        ...current.timeline,
        {
          id: `event-${Date.now()}`,
          at: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
          title: titles[input.type],
          detail: input.note || 'Демонстрационное действие преподавателя',
          kind: 'intervention',
          mock: true,
        },
      ],
    };
    this.sessions = this.sessions.map((item) => (item.callId === input.callId ? updated : item));
    return clone(updated);
  }

  private updateResult(id: string, update: (result: CompletedResult) => CompletedResult) {
    const current = this.results.find((item) => item.id === id);
    if (!current) throw new Error('Результат не найден');
    const saved = update(current);
    this.results = this.results.map((item) => (item.id === id ? saved : item));
    return clone(saved);
  }
}
