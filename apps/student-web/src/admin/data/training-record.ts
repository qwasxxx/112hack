import { SCENARIOS } from '../../data/scenarios';
import { ADMIN_TRAINING_STORE, readAllFromStore } from '../../local-db/open';
import { createAuditEntry, type StudentProgress } from './admin';
import { appendAuditEntry, persistTraining } from './system-persistence';

export type CompletedTrainingInput = {
  userId: string;
  userName: string;
  userLogin: string;
  scenarioCode: string;
  scenarioTitle: string;
  score: number;
};

export function scoreFromFindings(findings: number): number {
  return Math.max(0, Math.min(100, Math.round(100 - findings * 18)));
}

export function scoreFromChecks(flags: boolean[]): number {
  if (flags.length === 0) {
    return 0;
  }
  return Math.round((flags.filter(Boolean).length / flags.length) * 100);
}

export async function recordCompletedTraining(input: CompletedTrainingInput): Promise<void> {
  const existing = await readAllFromStore<StudentProgress>(ADMIN_TRAINING_STORE);
  const now = new Date().toISOString();
  const score = Math.max(0, Math.min(100, Math.round(input.score)));
  const current = existing.find((row) => row.userId === input.userId);
  const lessons = [...(current?.lessons ?? [])];
  const lesson = { code: input.scenarioCode, title: input.scenarioTitle, percent: score };
  const index = lessons.findIndex((item) => item.code === input.scenarioCode);
  if (index >= 0) {
    lessons[index] = lesson;
  } else {
    lessons.push(lesson);
  }
  const lessonsDone = lessons.filter((item) => item.percent > 0).length;
  const next: StudentProgress = {
    userId: input.userId,
    lessons,
    lessonsDone,
    lessonsTotal: Math.max(current?.lessonsTotal ?? 0, lessons.length, SCENARIOS.length || 3),
    lastScore: score,
    lastAt: now,
  };
  const rows = existing.some((row) => row.userId === input.userId)
    ? existing.map((row) => (row.userId === input.userId ? next : row))
    : [...existing, next];
  await persistTraining(rows);
  await appendAuditEntry(
    createAuditEntry({
      actor: input.userName,
      actorId: input.userId,
      actorLogin: input.userLogin,
      action: 'Сессия обучения завершена',
      eventType: 'training_completed',
      target: `${input.userName} · ${input.scenarioCode}`,
      details: `Результат ${score}% · сценарий «${input.scenarioTitle}»`,
      severity: 'info',
    }),
  );
}
