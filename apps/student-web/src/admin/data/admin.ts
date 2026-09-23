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

export type ServiceId = 'api' | 'realtime' | 'stt' | 'llm' | 'tts' | 'postgres' | 'sip';

export type ServiceRecord = {
  id: ServiceId;
  title: string;
  detail: string;
  running: boolean;
  ready?: boolean;
  latencyMs?: number;
  note?: string;
  startedAt?: string;
  lastChangeAt: string;
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

export type AuditEventType =
  | 'login'
  | 'logout'
  | 'account_created'
  | 'account_blocked'
  | 'account_unblocked'
  | 'role_changed'
  | 'password_reset'
  | 'backup_created'
  | 'service_started'
  | 'service_stopped'
  | 'service_error'
  | 'training_completed';

export type AuditSeverity = 'info' | 'ok' | 'warn' | 'error';

export type AuditEntry = {
  id: string;
  at: string;
  actor: string;
  actorId?: string;
  actorLogin?: string;
  action: string;
  eventType: AuditEventType;
  target: string;
  details: string;
  severity: AuditSeverity;
};

export type BackupStatus = 'ok' | 'failed';

export type BackupRecord = {
  id: string;
  at: string;
  status: BackupStatus;
  kind: 'manual' | 'scheduled';
  note: string;
  userCount?: number;
  auditCount?: number;
};

export type ContourSettings = {
  id: 'contour';
  sipHost: string;
  sipPort: string;
  codec: string;
  maxSessions: string;
  backupHour: string;
  lastBackupAt: string;
  lastBackupStatus: BackupStatus;
  lastBackupFile?: string;
  lastBackupDir?: string;
  logLevel: 'info' | 'debug' | 'warn';
  logRetentionDays: string;
  tls: boolean;
  rbac: boolean;
};

export const CONTOUR_RUNTIME = 'local-simulated' as const;

export const ROLE_LABEL: Record<RoleName, string> = {
  [Role.STUDENT]: 'Обучающийся',
  [Role.TEACHER]: 'Преподаватель',
  [Role.ADMIN]: 'Администратор',
};

export const AUDIT_EVENT_LABEL: Record<AuditEventType, string> = {
  login: 'Вход',
  logout: 'Выход',
  account_created: 'Учётка создана',
  account_blocked: 'Учётка заблокирована',
  account_unblocked: 'Учётка разблокирована',
  role_changed: 'Роль изменена',
  password_reset: 'Пароль сброшен',
  backup_created: 'Резервная копия',
  service_started: 'Сервис запущен',
  service_stopped: 'Сервис остановлен',
  service_error: 'Ошибка сервиса',
  training_completed: 'Сессия обучения',
};

export const AUDIT_SEVERITY_LABEL: Record<AuditSeverity, string> = {
  info: 'Инфо',
  ok: 'Успех',
  warn: 'Внимание',
  error: 'Ошибка',
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

const SEED_CHANGE = '2026-09-16T03:00:00.000Z';

export const INITIAL_SERVICES: ServiceRecord[] = [
  {
    id: 'api',
    title: 'API',
    detail: 'REST-шлюз учебного контура на этой машине',
    running: true,
    startedAt: SEED_CHANGE,
    lastChangeAt: SEED_CHANGE,
  },
  {
    id: 'realtime',
    title: 'Realtime',
    detail: 'Сессии учебных вызовов',
    running: true,
    startedAt: SEED_CHANGE,
    lastChangeAt: SEED_CHANGE,
  },
  {
    id: 'stt',
    title: 'STT',
    detail: 'Локальное распознавание речи',
    running: true,
    startedAt: SEED_CHANGE,
    lastChangeAt: SEED_CHANGE,
  },
  {
    id: 'llm',
    title: 'LLM',
    detail: 'Диалоговый модуль, локально',
    running: true,
    startedAt: SEED_CHANGE,
    lastChangeAt: SEED_CHANGE,
  },
  {
    id: 'tts',
    title: 'TTS',
    detail: 'Синтез речи заявителя, локально',
    running: true,
    startedAt: SEED_CHANGE,
    lastChangeAt: SEED_CHANGE,
  },
  {
    id: 'postgres',
    title: 'Локальная БД',
    detail: 'PostgreSQL учебного контура',
    running: true,
    startedAt: SEED_CHANGE,
    lastChangeAt: SEED_CHANGE,
  },
  {
    id: 'sip',
    title: 'SIP / VoIP',
    detail: 'Не входит в учебный контур',
    running: false,
    lastChangeAt: SEED_CHANGE,
  },
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
    actorId: 'admin-volkova',
    actorLogin: 'volkova',
    action: 'Создана учётная запись',
    eventType: 'account_created',
    target: 'kozlov · обучающийся',
    details: 'Локальная учётка учебного контура',
    severity: 'ok',
  },
  {
    id: 'a2',
    at: '2026-09-16T09:40:00.000Z',
    actor: 'Волкова М. И.',
    actorId: 'admin-volkova',
    actorLogin: 'volkova',
    action: 'Резервная копия',
    eventType: 'backup_created',
    target: 'ежедневный снимок БД',
    details: 'Локальный снимок IndexedDB, без выгрузки во внешнее облако',
    severity: 'ok',
  },
  {
    id: 'a3',
    at: '2026-09-15T18:22:00.000Z',
    actor: 'система',
    actorLogin: 'system',
    action: 'Ошибка сервиса',
    eventType: 'service_error',
    target: 'STT: краткий обрыв, восстановлен',
    details: 'Учебный контур восстановил распознавание речи',
    severity: 'warn',
  },
  {
    id: 'a4',
    at: '2026-09-15T16:11:00.000Z',
    actor: 'Волкова М. И.',
    actorId: 'admin-volkova',
    actorLogin: 'volkova',
    action: 'Учётная запись заблокирована',
    eventType: 'account_blocked',
    target: 'novikova · обучающийся',
    details: 'Доступ к учебному комплексу приостановлен',
    severity: 'warn',
  },
  {
    id: 'a5',
    at: '2026-09-15T14:12:00.000Z',
    actor: 'система',
    actorLogin: 'system',
    action: 'Сессия обучения завершена',
    eventType: 'training_completed',
    target: 'Смирнова А. В. · 112-02',
    details: 'Результат 80% · сценарий «ДТП на перекрёстке»',
    severity: 'info',
  },
];

export const INITIAL_SETTINGS: ContourSettings = {
  id: 'contour',
  sipHost: '10.12.0.8',
  sipPort: '5060',
  codec: 'G.711',
  maxSessions: '20',
  backupHour: '03:00',
  lastBackupAt: '2026-09-16T03:00:00.000Z',
  lastBackupStatus: 'ok',
  logLevel: 'info',
  logRetentionDays: '180',
  tls: true,
  rbac: true,
};

export const INITIAL_BACKUPS: BackupRecord[] = [
  {
    id: 'b-seed',
    at: '2026-09-16T03:00:00.000Z',
    status: 'ok',
    kind: 'scheduled',
    note: 'ежедневный снимок локальной БД',
    userCount: 5,
    auditCount: 5,
  },
];

export function formatWhen(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatWhenFull(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

export function formatUptime(startedAt: string | undefined, running: boolean): string {
  if (!running || !startedAt) {
    return 'остановлен';
  }
  const ms = Math.max(0, Date.now() - new Date(startedAt).getTime());
  const minutes = Math.floor(ms / 60000);
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes - days * 60 * 24) / 60);
  const mins = minutes % 60;
  if (days > 0) {
    return `${days} сут ${hours} ч`;
  }
  if (hours > 0) {
    return `${hours} ч ${mins} мин`;
  }
  return `${mins} мин`;
}

export function nextId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createAuditEntry(input: {
  actor: string;
  actorId?: string;
  actorLogin?: string;
  action: string;
  eventType: AuditEventType;
  target: string;
  details: string;
  severity?: AuditSeverity;
}): AuditEntry {
  return {
    id: nextId('audit'),
    at: new Date().toISOString(),
    actor: input.actor,
    actorId: input.actorId,
    actorLogin: input.actorLogin,
    action: input.action,
    eventType: input.eventType,
    target: input.target,
    details: input.details,
    severity: input.severity ?? 'info',
  };
}

export function emptyStudentProgress(userId: string, at: string): StudentProgress {
  return {
    userId,
    lessonsDone: 0,
    lessonsTotal: 3,
    lastScore: 0,
    lastAt: at,
    lessons: [
      { code: '112-01', title: 'Пожар в квартире', percent: 0 },
      { code: '112-02', title: 'ДТП на перекрёстке', percent: 0 },
      { code: '112-03', title: 'Потерявшийся ребёнок', percent: 0 },
    ],
  };
}
