import { Role, type Role as RoleName } from '@sys112/shared-types';

export type AccountStatus = 'active' | 'blocked';

export type AdminUser = {
  id: string;
  name: string;
  login: string;
  role: RoleName;
  status: AccountStatus;
  createdAt: string;
};

export type ServiceId = 'api' | 'realtime' | 'stt' | 'llm' | 'postgres' | 'sip';

export type ServiceRecord = {
  id: ServiceId;
  title: string;
  detail: string;
  running: boolean;
};

export type LessonProgress = {
  code: string;
  title: string;
  percent: number;
};

export type StudentProgress = {
  userId: string;
  lessonsDone: number;
  lessonsTotal: number;
  lastScore: number;
  lastAt: string;
  lessons: LessonProgress[];
};

export type AuditEntry = {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
};

export type ContourSettings = {
  sipHost: string;
  sipPort: string;
  codec: string;
  maxSessions: string;
  backupHour: string;
  lastBackupAt: string;
  logLevel: 'info' | 'debug' | 'warn';
  logRetentionDays: string;
  tls: boolean;
  rbac: boolean;
};

export const ROLE_LABEL: Record<RoleName, string> = {
  [Role.STUDENT]: 'Обучающийся',
  [Role.TEACHER]: 'Преподаватель',
  [Role.ADMIN]: 'Администратор',
};

export const CURRENT_ADMIN: AdminUser = {
  id: 'admin-volkova',
  name: 'Волкова М. И.',
  login: 'volkova',
  role: Role.ADMIN,
  status: 'active',
  createdAt: '2026-03-02T09:00:00.000Z',
};

export const INITIAL_USERS: AdminUser[] = [
  CURRENT_ADMIN,
  {
    id: 'teacher-petrov',
    name: 'Петров Д. А.',
    login: 'petrov',
    role: Role.TEACHER,
    status: 'active',
    createdAt: '2026-04-11T10:15:00.000Z',
  },
  {
    id: 'student-smirnova',
    name: 'Смирнова А. В.',
    login: 'smirnova',
    role: Role.STUDENT,
    status: 'active',
    createdAt: '2026-05-18T08:40:00.000Z',
  },
  {
    id: 'student-kozlov',
    name: 'Козлов И. П.',
    login: 'kozlov',
    role: Role.STUDENT,
    status: 'active',
    createdAt: '2026-05-18T08:41:00.000Z',
  },
  {
    id: 'student-novikova',
    name: 'Новикова Е. С.',
    login: 'novikova',
    role: Role.STUDENT,
    status: 'blocked',
    createdAt: '2026-06-03T12:20:00.000Z',
  },
];

export const INITIAL_SERVICES: ServiceRecord[] = [
  { id: 'api', title: 'API', detail: 'Учебный контур, REST', running: true },
  { id: 'realtime', title: 'Realtime', detail: 'Сессии вызовов', running: true },
  { id: 'stt', title: 'STT', detail: 'Распознавание речи, локально', running: true },
  { id: 'llm', title: 'LLM', detail: 'Диалоговый модуль, локально', running: true },
  { id: 'postgres', title: 'PostgreSQL', detail: 'Основная база', running: true },
  { id: 'sip', title: 'SIP / VoIP', detail: 'Эмуляция IP-телефонии', running: true },
];

export const INITIAL_PROGRESS: StudentProgress[] = [
  {
    userId: 'student-smirnova',
    lessonsDone: 2,
    lessonsTotal: 3,
    lastScore: 86,
    lastAt: '2026-09-15T14:12:00.000Z',
    lessons: [
      { code: '112-01', title: 'Пожар в квартире', percent: 92 },
      { code: '112-02', title: 'ДТП на перекрёстке', percent: 80 },
      { code: '112-03', title: 'Потерявшийся ребёнок', percent: 0 },
    ],
  },
  {
    userId: 'student-kozlov',
    lessonsDone: 1,
    lessonsTotal: 3,
    lastScore: 71,
    lastAt: '2026-09-14T11:05:00.000Z',
    lessons: [
      { code: '112-01', title: 'Пожар в квартире', percent: 71 },
      { code: '112-02', title: 'ДТП на перекрёстке', percent: 0 },
      { code: '112-03', title: 'Потерявшийся ребёнок', percent: 0 },
    ],
  },
  {
    userId: 'student-novikova',
    lessonsDone: 0,
    lessonsTotal: 3,
    lastScore: 0,
    lastAt: '2026-06-03T12:20:00.000Z',
    lessons: [
      { code: '112-01', title: 'Пожар в квартире', percent: 0 },
      { code: '112-02', title: 'ДТП на перекрёстке', percent: 0 },
      { code: '112-03', title: 'Потерявшийся ребёнок', percent: 0 },
    ],
  },
];

export const INITIAL_AUDIT: AuditEntry[] = [
  {
    id: 'a1',
    at: '2026-09-16T10:04:00.000Z',
    actor: 'Волкова М. И.',
    action: 'Создана учётная запись',
    target: 'kozlov · обучающийся',
  },
  {
    id: 'a2',
    at: '2026-09-16T09:40:00.000Z',
    actor: 'Волкова М. И.',
    action: 'Резервная копия',
    target: 'ежедневный снимок БД',
  },
  {
    id: 'a3',
    at: '2026-09-15T18:22:00.000Z',
    actor: 'система',
    action: 'Ошибка сервиса',
    target: 'STT: краткий обрыв, восстановлен',
  },
  {
    id: 'a4',
    at: '2026-09-15T16:11:00.000Z',
    actor: 'Волкова М. И.',
    action: 'Учётная запись заблокирована',
    target: 'novikova · обучающийся',
  },
  {
    id: 'a5',
    at: '2026-09-15T14:12:00.000Z',
    actor: 'система',
    action: 'Сессия обучения завершена',
    target: 'Смирнова А. В. · 112-02',
  },
];

export const INITIAL_SETTINGS: ContourSettings = {
  sipHost: '10.12.0.8',
  sipPort: '5060',
  codec: 'G.711',
  maxSessions: '20',
  backupHour: '03:00',
  lastBackupAt: '2026-09-16T03:00:00.000Z',
  logLevel: 'info',
  logRetentionDays: '180',
  tls: true,
  rbac: true,
};

export function formatWhen(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function nextId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}
