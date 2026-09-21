import { Role } from '@sys112/shared-types';
import type { TeacherDashboardRepository } from '../../../teacher-web/src/teacher-dashboard/application/ports/teacher-dashboard-repository';
import type {
  ActiveSession,
  AuditRecord,
  CompletedResult,
  DashboardSnapshot,
  InterventionInput,
  Scenario,
  ScenarioDraft,
  Student,
  TrainingMaterial,
} from '../../../teacher-web/src/teacher-dashboard/domain/entities';
import type { Account } from '../auth/accounts';
import { loadAccounts } from '../auth/accounts';
import { SCENARIOS, SERVICE_LABEL } from '../data/scenarios';
import {
  assignScenario,
  assignedScenarioIds,
  isScenarioAssigned,
  readAllLessons,
  readLiveSessions,
  unassignScenario,
  type LessonRecord,
} from '../progress';

const COMMENTS_KEY = 'sys112.teacher.comments.v1';
const AUDIT_KEY = 'sys112.teacher.audit.v1';
const CUSTOM_SCENARIOS_KEY = 'sys112.teacher.scenarios.v1';

type CommentMap = Record<string, { expertScore?: number; comment?: string }>;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function mapDifficulty(value: string): Scenario['difficulty'] {
  if (value === 'базовый') {
    return 'intro';
  }
  if (value === 'сложный') {
    return 'advanced';
  }
  return 'standard';
}

function toScenario(id: string): Scenario | null {
  const ticket = SCENARIOS.find((item) => item.id === id);
  if (!ticket) {
    return null;
  }
  const assigned = isScenarioAssigned(ticket.id);
  return {
    id: ticket.id,
    title: `${ticket.code} ${ticket.title}`,
    category: SERVICE_LABEL[ticket.services[0] ?? 'police'],
    location: ticket.address ?? '',
    difficulty: mapDifficulty(ticket.difficulty),
    description: ticket.summary,
    timeLimitSec: 30,
    requiredActions: ticket.checklist.slice(0, 6),
    allowedErrors: 1,
    passThreshold: ticket.difficulty === 'сложный' ? 80 : 70,
    materials: ['Справочные материалы АРМ-112'],
    allowedInterventions: ['set_emotional_state', 'add_circumstance', 'inject_event', 'end_call'],
    version: 1,
    status: assigned ? 'active' : 'archived',
    assignments: assigned ? 1 : 0,
    updatedAt: new Date().toISOString(),
  };
}

function customScenarios(): Scenario[] {
  return readJson<Scenario[]>(CUSTOM_SCENARIOS_KEY, []);
}

function lessonToResult(lesson: LessonRecord, students: Student[]): CompletedResult {
  const student =
    students.find((item) => item.id === lesson.operatorLogin || item.name.includes(lesson.operatorLogin)) ?? {
      id: lesson.operatorLogin,
      name: lesson.operatorLogin,
      groupId: 'g-local',
    };
  const comments = readJson<CommentMap>(COMMENTS_KEY, {});
  const overlay = comments[lesson.id] ?? {};
  const automaticScore = lesson.score;
  const expertScore = overlay.expertScore ?? automaticScore;
  return {
    id: lesson.id,
    callId: lesson.id,
    student,
    scenarioId: lesson.scenarioId,
    scenarioTitle: `${lesson.scenarioCode} ${lesson.scenarioTitle}`,
    category: lesson.mode === 'dds' ? 'ДДС' : lesson.mode === 'exam' ? 'Экзамен' : 'Тренировка 112',
    completedAt: lesson.completedAt,
    durationSec: lesson.elapsedSeconds,
    automaticScore,
    expertScore,
    finalScore: Math.round((automaticScore + expertScore) / 2),
    passed: overlay.expertScore != null ? overlay.expertScore >= (lesson.mode === 'exam' ? 80 : 70) : lesson.passed,
    criteria: [
      {
        criterionId: 'card',
        label: 'Карточка',
        score: lesson.cardScore ?? Math.min(50, lesson.score),
        maxScore: 50,
        passed: (lesson.cardScore ?? lesson.score) >= 35,
        deductions: 0,
        evidence: [],
      },
      {
        criterionId: 'call',
        label: 'Разговор / обработка',
        score: lesson.callScore ?? Math.max(0, lesson.score - (lesson.cardScore ?? 0)),
        maxScore: 50,
        passed: lesson.passed,
        deductions: 0,
        evidence: [],
      },
    ],
    mistakes: lesson.findings.map((item) => ({
      code: item.code,
      severity: item.severity === 'error' ? 'major' : 'minor',
      description: `${item.field}: ${item.message}`,
      evidence: [{ source: 'incident_card', ref: item.field, quote: item.message }],
    })),
    recommendations: lesson.recommendations,
    transcriptEvidence: [],
    teacherComment: overlay.comment ?? '',
  };
}

function emptyCard(): ActiveSession['incidentCard'] {
  return {};
}

export class LocalTeacherDashboardRepository implements TeacherDashboardRepository {
  private async students(): Promise<Student[]> {
    const accounts = await loadAccounts();
    return accounts
      .filter((item: Account) => item.role === Role.STUDENT)
      .map((item) => ({ id: item.login, name: item.name, groupId: 'g-local' }));
  }

  async getDashboardSnapshot(): Promise<DashboardSnapshot> {
    const students = await this.students();
    const results = await this.getResults();
    const live = readLiveSessions();
    const assigned = assignedScenarioIds().length;
    const avg = results.length
      ? Math.round(results.reduce((sum, item) => sum + item.finalScore, 0) / results.length)
      : 0;
    const passed = results.filter((item) => item.passed).length;
    const errorMap = new Map<string, number>();
    for (const result of results) {
      for (const mistake of result.mistakes) {
        errorMap.set(mistake.description, (errorMap.get(mistake.description) ?? 0) + 1);
      }
    }
    const commonErrors = [...errorMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, count]) => ({ label, count }));
    const trend = results.slice(-8).map((item) => item.finalScore);
    return {
      teacher: { id: 'teacher-petrov', name: 'Петров Д. А.', shift: 'Локальный контур' },
      groups: [{ id: 'g-local', name: 'Учебная группа', studentCount: students.length }],
      students,
      activeCount: live.length,
      averageScore: avg,
      completionRate: assigned === 0 ? 0 : Math.min(100, Math.round((passed / Math.max(assigned, 1)) * 100)),
      upcomingLessons: assigned
        ? [{ id: 'asg-1', title: `Назначено билетов: ${assigned}`, group: 'Учебная группа', startsAt: new Date().toISOString() }]
        : [],
      scoreTrend: trend.length ? trend : [0],
      categoryScores: [
        { category: 'Тренировка 112', score: avgFor(results, 'Тренировка 112') },
        { category: 'Экзамен', score: avgFor(results, 'Экзамен') },
        { category: 'ДДС', score: avgFor(results, 'ДДС') },
      ].filter((item) => item.score > 0),
      commonErrors,
    };
  }

  async getActiveSessions(): Promise<ActiveSession[]> {
    const students = await this.students();
    return readLiveSessions().map((item) => {
      const student =
        students.find((row) => row.id === item.login) ?? {
          id: item.login,
          name: item.name,
          groupId: 'g-local',
        };
      const durationSec = Math.max(0, Math.round((Date.now() - Date.parse(item.startedAt)) / 1000));
      return {
        callId: `live-${item.login}`,
        student,
        scenarioId: item.scenarioId,
        scenarioTitle: item.scenarioTitle,
        category: item.mode === 'dds' ? 'ДДС' : item.mode === 'exam' ? 'Экзамен' : 'Тренировка',
        difficulty: 'standard',
        mode: item.mode === 'exam' ? 'exam' : 'training',
        startedAt: item.startedAt,
        durationSec,
        status: 'live',
        cardProgress: item.cardProgress,
        foundActions: 0,
        missedActions: 0,
        emotionalState: { primary: 'anxious', intensity: 0.4, stability: 0.6 },
        riskSignals: {
          missedRequiredQuestions: 0,
          longPauses: 0,
          emptyRequiredFields: 0,
          repeatedQuestions: 0,
          emotionalEscalation: 0,
          actionOrderViolations: 0,
          timeLimitRatio: Math.min(1, durationSec / 180),
          hasCriticalError: false,
        },
        riskHistory: [12, 18, 22],
        transcript: [],
        incidentCard: emptyCard(),
        requiredActions: [],
        protocolViolations: [],
        timeline: [
          {
            id: `t-${item.login}`,
            at: new Date(item.startedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
            title: 'Занятие начато',
            detail: item.scenarioTitle,
            kind: 'system',
          },
        ],
        currentScore: 0,
      };
    });
  }

  async getSession(callId: string): Promise<ActiveSession | null> {
    const sessions = await this.getActiveSessions();
    return sessions.find((item) => item.callId === callId) ?? null;
  }

  async getScenarios(): Promise<Scenario[]> {
    const tickets = SCENARIOS.map((item) => toScenario(item.id)).filter((item): item is Scenario => Boolean(item));
    return [...customScenarios(), ...tickets];
  }

  async getMaterials(): Promise<TrainingMaterial[]> {
    return [
      {
        id: 'mat-handbook',
        title: 'Справочные материалы АРМ-112',
        fileType: 'HTML',
        version: '1.0',
        scenarioId: SCENARIOS[0]?.id ?? 'handbook',
      },
    ];
  }

  async saveScenario(draft: ScenarioDraft): Promise<Scenario> {
    const saved: Scenario = {
      ...draft,
      id: draft.id ?? `custom-${Date.now()}`,
      version: 1,
      status: 'active',
      assignments: 1,
      updatedAt: new Date().toISOString(),
    };
    const current = customScenarios().filter((item) => item.id !== saved.id);
    writeJson(CUSTOM_SCENARIOS_KEY, [...current, saved]);
    assignScenario(saved.id);
    return saved;
  }

  async setScenarioArchived(id: string, archived: boolean): Promise<Scenario> {
    if (archived) {
      unassignScenario(id);
    } else {
      assignScenario(id);
    }
    const list = await this.getScenarios();
    const current = list.find((item) => item.id === id);
    if (!current) {
      throw new Error('Сценарий не найден');
    }
    return {
      ...current,
      status: archived ? 'archived' : 'active',
      assignments: archived ? 0 : 1,
      updatedAt: new Date().toISOString(),
    };
  }

  async getResults(): Promise<CompletedResult[]> {
    const students = await this.students();
    return readAllLessons()
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
      .map((item) => lessonToResult(item, students));
  }

  async saveExpertComment(resultId: string, comment: string): Promise<CompletedResult> {
    const comments = readJson<CommentMap>(COMMENTS_KEY, {});
    comments[resultId] = { ...comments[resultId], comment };
    writeJson(COMMENTS_KEY, comments);
    const results = await this.getResults();
    const saved = results.find((item) => item.id === resultId);
    if (!saved) {
      throw new Error('Результат не найден');
    }
    return saved;
  }

  async adjustExpertScore(resultId: string, score: number, reason: string): Promise<CompletedResult> {
    if (!reason.trim()) {
      throw new Error('Укажите причину корректировки');
    }
    const comments = readJson<CommentMap>(COMMENTS_KEY, {});
    const before = comments[resultId]?.expertScore;
    comments[resultId] = { ...comments[resultId], expertScore: score };
    writeJson(COMMENTS_KEY, comments);
    const audit = readJson<AuditRecord[]>(AUDIT_KEY, []);
    audit.unshift({
      id: `audit-${Date.now()}`,
      at: new Date().toISOString(),
      actor: 'Преподаватель',
      action: 'Корректировка экспертной оценки',
      entityId: resultId,
      previousValue: before != null ? String(before) : '',
      newValue: String(score),
      reason,
      mock: true,
    });
    writeJson(AUDIT_KEY, audit);
    const results = await this.getResults();
    const saved = results.find((item) => item.id === resultId);
    if (!saved) {
      throw new Error('Результат не найден');
    }
    return saved;
  }

  async applyIntervention(input: InterventionInput): Promise<ActiveSession> {
    const session = await this.getSession(input.callId);
    if (!session) {
      throw new Error('Сессия не найдена');
    }
    return {
      ...session,
      timeline: [
        ...session.timeline,
        {
          id: `int-${Date.now()}`,
          at: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
          title: 'Вмешательство',
          detail: input.note || input.type,
          kind: 'intervention',
        },
      ],
    };
  }

  async getAudit(): Promise<AuditRecord[]> {
    return readJson<AuditRecord[]>(AUDIT_KEY, []);
  }
}

function avgFor(results: CompletedResult[], category: string): number {
  const rows = results.filter((item) => item.category === category);
  if (!rows.length) {
    return 0;
  }
  return Math.round(rows.reduce((sum, item) => sum + item.finalScore, 0) / rows.length);
}
