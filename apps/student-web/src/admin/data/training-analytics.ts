import { SCENARIOS } from '../../data/scenarios';
import type { AdminUser, AuditEntry, LessonProgress, StudentProgress } from './admin';

export type TrainingWindow = 'all' | '7d' | '30d';
export type TrainingCategory = 'all' | 'Пожар' | 'ДТП' | 'Поиск' | 'Прочее';

export type TrainingFilters = {
  category: TrainingCategory;
  window: TrainingWindow;
};

export type CategoryScore = {
  category: Exclude<TrainingCategory, 'all'>;
  score: number;
  attempts: number;
};

export type ScenarioUsage = {
  code: string;
  title: string;
  category: Exclude<TrainingCategory, 'all'>;
  attempts: number;
  avg: number;
  usage: number;
};

export type ProgressBucket = {
  label: string;
  count: number;
  percent: number;
};

export type StudentTrainingRow = {
  userId: string;
  name: string;
  login: string;
  status: AdminUser['status'];
  lessonsDone: number;
  lessonsTotal: number;
  lastScore: number;
  lastAt: string;
  overall: number;
  lessons: LessonProgress[];
};

export type TrainingActivity = {
  id: string;
  at: string;
  title: string;
  detail: string;
};

export type LastAttempt = {
  name: string;
  login: string;
  at: string;
  score: number;
};

export type TrainingAnalytics = {
  studentCount: number;
  activeStudents: number;
  sessions: number;
  activeTraining: number;
  lessonsDone: number;
  lessonsTotal: number;
  completion: number;
  avgScore: number;
  catalogSize: number;
  scoreSamples: number;
  lastAttempt: LastAttempt | null;
  scoreTrend: number[];
  categories: CategoryScore[];
  distribution: ProgressBucket[];
  scenarios: ScenarioUsage[];
  rows: StudentTrainingRow[];
  recent: TrainingActivity[];
  weakAreas: Array<{ label: string; count: number }>;
};

const CATEGORY_ORDER: Array<Exclude<TrainingCategory, 'all'>> = ['Пожар', 'ДТП', 'Поиск', 'Прочее'];

export function categoryOfLesson(lesson: Pick<LessonProgress, 'title' | 'code'>): Exclude<TrainingCategory, 'all'> {
  const text = `${lesson.title} ${lesson.code}`.toLowerCase();
  if (/пожар|дым|огонь|задым/.test(text)) {
    return 'Пожар';
  }
  if (/дтп|перекрёст|перекрест|наезд/.test(text)) {
    return 'ДТП';
  }
  if (/ребён|ребен|потер/.test(text)) {
    return 'Поиск';
  }
  return 'Прочее';
}

function windowStart(window: TrainingWindow): number {
  if (window === 'all') {
    return 0;
  }
  const days = window === '7d' ? 7 : 30;
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

function inWindow(at: string, start: number): boolean {
  return new Date(at).getTime() >= start;
}

export function buildTrainingAnalytics(
  users: AdminUser[],
  progress: StudentProgress[],
  audit: AuditEntry[],
  filters: TrainingFilters,
): TrainingAnalytics {
  const students = users.filter((user) => user.role === 'STUDENT');
  const start = windowStart(filters.window);
  const byId = new Map(progress.map((item) => [item.userId, item]));

  const rows: StudentTrainingRow[] = students.map((user) => {
    const item = byId.get(user.id);
    const lessons = (item?.lessons ?? []).filter(
      (lesson) => filters.category === 'all' || categoryOfLesson(lesson) === filters.category,
    );
    const lessonsDone = lessons.filter((lesson) => lesson.percent > 0).length;
    const lessonsTotal = lessons.length || (filters.category === 'all' ? (item?.lessonsTotal ?? 3) : 0);
    const lastAt = item?.lastAt ?? user.createdAt;
    return {
      userId: user.id,
      name: user.name,
      login: user.login,
      status: user.status,
      lessonsDone,
      lessonsTotal,
      lastScore: item?.lastScore ?? 0,
      lastAt,
      overall: lessonsTotal === 0 ? 0 : Math.round((lessonsDone / lessonsTotal) * 100),
      lessons,
    };
  });

  const visibleRows = rows.filter((row) => {
    if (filters.window !== 'all' && !inWindow(row.lastAt, start)) {
      return false;
    }
    if (filters.category !== 'all' && row.lessonsTotal === 0) {
      return false;
    }
    return true;
  });
  const scoped = visibleRows;

  const lessonsDone = scoped.reduce((sum, row) => sum + row.lessonsDone, 0);
  const lessonsTotal = scoped.reduce((sum, row) => sum + row.lessonsTotal, 0);
  const scored = scoped.filter((row) => row.lastScore > 0 && inWindow(row.lastAt, start));
  const avgScore =
    scored.length === 0 ? 0 : Math.round(scored.reduce((sum, row) => sum + row.lastScore, 0) / scored.length);

  const scoreTrend = [...scored]
    .sort((a, b) => new Date(a.lastAt).getTime() - new Date(b.lastAt).getTime())
    .map((row) => row.lastScore);
  const newest = [...scored].sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime())[0];
  const lastAttempt: LastAttempt | null = newest
    ? { name: newest.name, login: newest.login, at: newest.lastAt, score: newest.lastScore }
    : null;

  const categoryMap = new Map<Exclude<TrainingCategory, 'all'>, { total: number; attempts: number }>();
  const scenarioMap = new Map<string, ScenarioUsage>();
  for (const row of scoped) {
    for (const lesson of row.lessons) {
      const category = categoryOfLesson(lesson);
      const cat = categoryMap.get(category) ?? { total: 0, attempts: 0 };
      if (lesson.percent > 0) {
        cat.attempts += 1;
        cat.total += lesson.percent;
      }
      categoryMap.set(category, cat);

      const current = scenarioMap.get(lesson.code) ?? {
        code: lesson.code,
        title: lesson.title,
        category,
        attempts: 0,
        avg: 0,
        usage: 0,
      };
      if (lesson.percent > 0) {
        current.attempts += 1;
        current.avg += lesson.percent;
      }
      scenarioMap.set(lesson.code, current);
    }
  }

  const categories = CATEGORY_ORDER.map((category) => {
    const item = categoryMap.get(category) ?? { total: 0, attempts: 0 };
    return {
      category,
      attempts: item.attempts,
      score: item.attempts === 0 ? 0 : Math.round(item.total / item.attempts),
    };
  });

  const maxAttempts = Math.max(1, ...[...scenarioMap.values()].map((item) => item.attempts));
  const scenarios = [...scenarioMap.values()].map((item) => ({
    ...item,
    avg: item.attempts === 0 ? 0 : Math.round(item.avg / item.attempts),
    usage: Math.round((item.attempts / maxAttempts) * 100),
  }));

  const buckets = [
    { label: '0%', test: (value: number) => value === 0 },
    { label: '1–50%', test: (value: number) => value > 0 && value <= 50 },
    { label: '51–80%', test: (value: number) => value > 50 && value <= 80 },
    { label: '81–100%', test: (value: number) => value > 80 },
  ];
  const distribution = buckets.map((bucket) => {
    const count = scoped.filter((row) => bucket.test(row.overall)).length;
    return {
      label: bucket.label,
      count,
      percent: scoped.length === 0 ? 0 : Math.round((count / scoped.length) * 100),
    };
  });

  const recentFromProgress: TrainingActivity[] = [...scoped]
    .filter((row) => row.lastScore > 0)
    .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime())
    .slice(0, 6)
    .map((row) => ({
      id: `progress-${row.userId}`,
      at: row.lastAt,
      title: row.name,
      detail: `результат ${row.lastScore}% · ${row.lessonsDone}/${row.lessonsTotal} модулей`,
    }));

  const recentFromAudit: TrainingActivity[] = audit
    .filter((entry) => entry.eventType === 'training_completed' && inWindow(entry.at, start))
    .slice(0, 6)
    .map((entry) => ({
      id: entry.id,
      at: entry.at,
      title: entry.target,
      detail: entry.details,
    }));

  const recent = [...recentFromAudit, ...recentFromProgress]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .filter((item, index, all) => all.findIndex((other) => other.id === item.id || (other.at === item.at && other.title === item.title)) === index)
    .slice(0, 6);

  const weakAreas = categories
    .filter((item) => item.attempts > 0)
    .sort((a, b) => a.score - b.score)
    .map((item) => ({
      label: item.score < 75 ? `слабее по категории «${item.category}»` : `категория «${item.category}» в норме`,
      count: item.attempts,
    }));

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const activeTraining = rows.filter(
    (row) => row.lessonsDone > 0 && row.lessonsDone < row.lessonsTotal && new Date(row.lastAt).getTime() >= weekAgo,
  ).length;

  return {
    studentCount: students.length,
    activeStudents: students.filter((user) => user.status === 'active').length,
    sessions: lessonsDone,
    activeTraining,
    lessonsDone,
    lessonsTotal,
    completion: lessonsTotal === 0 ? 0 : Math.round((lessonsDone / lessonsTotal) * 100),
    avgScore,
    catalogSize: SCENARIOS.length,
    scoreSamples: scored.length,
    lastAttempt,
    scoreTrend,
    categories,
    distribution,
    scenarios,
    rows: scoped,
    recent,
    weakAreas,
  };
}
