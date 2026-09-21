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
import { SCENARIOS, SERVICE_LABEL, refreshScenarioCatalog } from '../data/scenarios';
import type { ServiceKind } from '../data/scenarios';
import { createCustomTicket, saveTicketPatch } from '../data/ticket-catalog';
import {
  assignScenario,
  assignedScenarioIds,
  isScenarioAssigned,
  liveCardSnapshot,
  pushTeacherCue,
  readAllLessons,
  readClassSession,
  readLiveSessions,
  subscribeLive,
  unassignScenario,
  type LessonRecord,
} from '../progress';
import { ticketFactsFrom, serviceLabels } from '../progress/ticket-facts';
import { latestCue } from '../progress/teacher-cues';
import { hydrateFromApi } from '../progress/hydrate';
import { pushAudit, pushOverlay } from '../progress/remote';

const COMMENTS_KEY = 'sys112.teacher.comments.v1';
const AUDIT_KEY = 'sys112.teacher.audit.v1';

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
  const facts = ticketFactsFrom(ticket);
  return {
    id: ticket.id,
    title: `${ticket.code} ${ticket.title}`,
    category: ticket.services.map((item) => SERVICE_LABEL[item]).join(', ') || SERVICE_LABEL.police,
    location: ticket.address ?? '',
    difficulty: mapDifficulty(ticket.difficulty),
    description: ticket.situation || ticket.summary,
    timeLimitSec: 30,
    requiredActions: ticket.checklist.slice(0, 8),
    allowedErrors: 1,
    passThreshold: ticket.difficulty === 'сложный' ? 80 : 70,
    materials: ['Справочные материалы АРМ-112'],
    allowedInterventions: ['set_emotional_state', 'add_circumstance', 'inject_event', 'end_call'],
    version: 1,
    status: assigned ? 'active' : 'archived',
    assignments: assigned ? 1 : 0,
    updatedAt: new Date().toISOString(),
    services: ticket.services,
    callerOpening: ticket.callerOpening,
    classifierNumber: ticket.classifierNumber,
    etalon: {
      what: facts.what,
      address: facts.address,
      phone: facts.phone,
      caller: facts.callerFio || facts.callerRole,
      services: serviceLabels(facts.services),
    },
  };
}

function toTicketDifficulty(value: Scenario['difficulty']): 'базовый' | 'стандарт' | 'сложный' {
  if (value === 'intro') {
    return 'базовый';
  }
  if (value === 'advanced' || value === 'stress') {
    return 'сложный';
  }
  return 'стандарт';
}

function asServices(values?: string[]): ServiceKind[] {
  const allowed: ServiceKind[] = ['fire', 'ambulance', 'police', 'gas'];
  return (values ?? []).filter((item): item is ServiceKind => allowed.includes(item as ServiceKind));
}

function emotionFromLogin(login: string): ActiveSession['emotionalState'] {
  const cue = latestCue(login);
  if (cue?.type === 'set_emotional_state') {
    return { primary: 'panicked', intensity: 0.86, stability: 0.22 };
  }
  if (cue?.type === 'inject_event' || cue?.type === 'adjust_difficulty') {
    return { primary: 'confused', intensity: 0.7, stability: 0.32 };
  }
  return { primary: 'anxious', intensity: 0.4, stability: 0.6 };
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
    cardTimerSeconds: lesson.cardTimerSeconds,
    cardTimerLimitSec: lesson.cardTimerLimitSec,
    cardTimerExceeded: lesson.cardTimerExceeded,
  };
}

export class LocalTeacherDashboardRepository implements TeacherDashboardRepository {
  private pendingHydrate?: Promise<void>;

  private hydrate(): Promise<void> {
    if (!this.pendingHydrate) {
      this.pendingHydrate = hydrateFromApi({ login: 'petrov', role: 'TEACHER' }).finally(() => {
        this.pendingHydrate = undefined;
      });
    }
    return this.pendingHydrate;
  }

  watch(onChange: () => void): () => void {
    return subscribeLive(onChange);
  }

  private async students(): Promise<Student[]> {
    const accounts = await loadAccounts();
    return accounts
      .filter((item: Account) => item.role === Role.STUDENT)
      .map((item) => ({ id: item.login, name: item.name, groupId: 'g-local' }));
  }

  async getDashboardSnapshot(): Promise<DashboardSnapshot> {
    await this.hydrate();
    const students = await this.students();
    const results = await this.getResults();
    const assigned = assignedScenarioIds().length;
    const live = readLiveSessions();
    const classSession = readClassSession();
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
      upcomingLessons: classSession.active
        ? [
            {
              id: 'class-live',
              title: classSession.title || 'Идёт занятие',
              group: 'Учебная группа',
              startsAt: classSession.startedAt,
            },
          ]
        : assigned
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
    await this.hydrate();
    const students = await this.students();
    return readLiveSessions().map((item) => {
      const student =
        students.find((row) => row.id === item.login) ?? {
          id: item.login,
          name: item.name,
          groupId: 'g-local',
        };
      const durationSec = Math.max(0, Math.round((Date.now() - Date.parse(item.startedAt)) / 1000));
      const snap = liveCardSnapshot(item.login, item.scenarioId, item.mode);
      const cue = latestCue(item.login);
      const progress = item.cardProgress || snap.percent;
      const rows = item.cardRows?.length ? item.cardRows : snap.rows;
      const briefing = item.phase === 'Брифинг' || item.phase === 'Теория';
      return {
        callId: `live-${item.login}`,
        student,
        scenarioId: item.scenarioId,
        scenarioTitle: item.phase ? `${item.scenarioTitle} · ${item.phase}` : item.scenarioTitle,
        category: briefing
          ? item.phase || 'Подготовка'
          : item.mode === 'dds'
            ? 'ДДС'
            : item.mode === 'exam'
              ? 'Экзамен'
              : 'Тренировка',
        difficulty: 'standard',
        mode: item.mode === 'exam' ? 'exam' : 'training',
        startedAt: item.startedAt,
        durationSec,
        status: briefing ? 'paused' : 'live',
        cardProgress: progress,
        foundActions: item.foundActions ?? snap.found,
        missedActions: item.missedActions ?? snap.missed,
        emotionalState: emotionFromLogin(item.login),
        riskSignals: {
          missedRequiredQuestions: 0,
          longPauses: 0,
          emptyRequiredFields: rows.filter((row) => row.key !== 'phase' && !row.filled).length,
          repeatedQuestions: 0,
          emotionalEscalation: cue?.type === 'set_emotional_state' ? 2 : 0,
          actionOrderViolations: 0,
          timeLimitRatio: Math.min(1, durationSec / 180),
          hasCriticalError: false,
        },
        riskHistory: [12, 18, Math.min(90, 20 + snap.missed * 8)],
        transcript: (item.transcript ?? []).map((line, index) => ({
          id: `tr-${item.login}-${index}`,
          role: line.role,
          text: line.text,
          at: line.at,
        })),
        incidentCard: Object.fromEntries(rows.map((row) => [row.label, row.value])),
        requiredActions: rows
          .filter((row) => row.key !== 'phase')
          .map((row) => ({
            id: row.key,
            label: row.label,
            completed: row.filled,
          })),
        protocolViolations: snap.missed ? [`Не заполнено полей: ${snap.missed}`] : [],
        timeline: [
          {
            id: `t-${item.login}`,
            at: new Date(item.startedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
            title: 'Занятие начато',
            detail: item.scenarioTitle,
            kind: 'system',
          },
          ...(cue
            ? [
                {
                  id: cue.id,
                  at: new Date(cue.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
                  title: 'Вмешательство',
                  detail: cue.note || cue.type,
                  kind: 'intervention' as const,
                },
              ]
            : []),
        ],
        currentScore: progress,
      };
    });
  }

  async getSession(callId: string): Promise<ActiveSession | null> {
    const sessions = await this.getActiveSessions();
    return sessions.find((item) => item.callId === callId) ?? null;
  }

  async getScenarios(): Promise<Scenario[]> {
    await this.hydrate();
    refreshScenarioCatalog();
    return SCENARIOS.map((item) => toScenario(item.id)).filter((item): item is Scenario => Boolean(item));
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
    refreshScenarioCatalog();
    const services = asServices(draft.services);
    const patch = {
      title: draft.title.trim(),
      situation: draft.description.trim(),
      address: draft.location.trim(),
      services: services.length ? services : (['police'] as ServiceKind[]),
      callerOpening: draft.callerOpening,
      classifierNumber: draft.classifierNumber,
      difficulty: toTicketDifficulty(draft.difficulty),
      checklist: draft.requiredActions,
    };
    const ticket =
      draft.id && SCENARIOS.some((item) => item.id === draft.id)
        ? saveTicketPatch(draft.id, patch)
        : createCustomTicket(patch);
    refreshScenarioCatalog();
    assignScenario(ticket.id);
    const saved = toScenario(ticket.id);
    if (!saved) {
      throw new Error('Билет не сохранён');
    }
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
    await this.hydrate();
    const students = await this.students();
    return readAllLessons()
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
      .map((item) => lessonToResult(item, students));
  }

  async saveExpertComment(resultId: string, comment: string): Promise<CompletedResult> {
    const comments = readJson<CommentMap>(COMMENTS_KEY, {});
    comments[resultId] = { ...comments[resultId], comment };
    writeJson(COMMENTS_KEY, comments);
    pushOverlay(resultId, comments[resultId]);
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
    pushOverlay(resultId, comments[resultId]);
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
    pushAudit(audit[0].id, audit[0] as unknown as Record<string, unknown>);
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
    const login = input.callId.startsWith('live-') ? input.callId.slice(5) : session.student.id;
    pushTeacherCue(login, input.type, input.note);
    return {
      ...session,
      emotionalState: emotionFromLogin(login),
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
