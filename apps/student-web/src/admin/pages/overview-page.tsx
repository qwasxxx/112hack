import type {
  AdminUser,
  AuditEntry,
  ContourSettings,
  ServiceId,
  ServiceRecord,
  StudentProgress,
} from '../data/admin';
import { formatWhen } from '../data/admin';
import dispatchCenter from '../../assets/catalog/catalog-dispatch-center.webp';
import {
  resolveServiceView,
  serviceStatusLabel,
  serviceTone,
  type ConnectionStatus,
} from '../data/service-status';

type Props = {
  users: AdminUser[];
  services: ServiceRecord[];
  progress: StudentProgress[];
  audit: AuditEntry[];
  settings: ContourSettings;
  apiStatus: ConnectionStatus;
  realtimeStatus: ConnectionStatus;
};

const SERVICE_VIEW: Record<ServiceId, { title: string; layer: string }> = {
  api: { title: 'API', layer: 'Учебный контур, REST' },
  realtime: { title: 'Realtime', layer: 'Сессии вызовов' },
  stt: { title: 'STT', layer: 'Распознавание речи, локально' },
  llm: { title: 'LLM', layer: 'Диалоговый модуль, локально' },
  postgres: { title: 'Локальная БД', layer: 'PostgreSQL учебного контура' },
  sip: { title: 'SIP / VoIP', layer: 'Не входит в контур' },
};

export function OverviewPage(props: Props) {
  const active = props.users.filter((user) => user.status === 'active').length;
  const blocked = props.users.filter((user) => user.status === 'blocked').length;
  const students = props.users.filter((user) => user.role === 'STUDENT');
  const teachers = props.users.filter((user) => user.role === 'TEACHER');
  const required = props.services.filter((item) => item.id !== 'sip');
  const running = required.filter((item) => item.running).length;
  const dbService = props.services.find((item) => item.id === 'postgres');
  const avg =
    props.progress.length === 0
      ? 0
      : Math.round(props.progress.reduce((sum, item) => sum + item.lastScore, 0) / props.progress.length);
  const contourOk =
    running === required.length && props.apiStatus !== 'bad' && props.realtimeStatus !== 'bad';
  const recentUsers = [...props.users]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);
  const host = typeof window === 'undefined' ? 'localhost' : window.location.host;
  const origin = typeof window === 'undefined' ? 'локальный контур' : window.location.origin;

  return (
    <div className="ad-page">
      <header className="ad-page-head">
        <div>
          <p className="ad-kicker">Система-112 — локальный центр управления учебным комплексом</p>
          <h1>Обзор</h1>
          <p className="ad-lead">
            Мониторинг учёток, сервисов и резервных копий. Оценки занятий и ход сценариев отсюда не
            меняются.
          </p>
        </div>
        <div className={`ad-health-flag is-${contourOk ? 'ok' : 'warn'}`}>
          <span className="ad-health-pulse" aria-hidden="true" />
          <div>
            <strong>{contourOk ? 'Контур в штатном режиме' : 'Требует внимания'}</strong>
            <small>
              {running}/{required.length} сервисов · API {liveLabel(props.apiStatus)}
            </small>
          </div>
        </div>
      </header>

      <section className="ad-surface ad-summary" aria-label="Глобальная сводка">
        <div className="ad-surface-head">
          <div>
            <p className="ad-kicker">Глобальная сводка</p>
            <h2>Состояние учебного комплекса</h2>
          </div>
          <span className="ad-help">Локальная среда · без внешних облачных контуров</span>
        </div>
        <div className="ad-metrics">
          <article className="ad-metric">
            <span>Активные учётки</span>
            <strong>{active}</strong>
            <small>
              из {props.users.length} · {blocked} в блоке
            </small>
          </article>
          <article className="ad-metric">
            <span>Обучающиеся</span>
            <strong>{students.length}</strong>
            <small>роли учебного контура</small>
          </article>
          <article className="ad-metric">
            <span>Преподаватели</span>
            <strong>{teachers.length}</strong>
            <small>доступ к панели занятий</small>
          </article>
          <article className="ad-metric ad-metric--accent">
            <span>Сервисы в работе</span>
            <strong>
              {running}/{props.services.length}
            </strong>
            <small>локальные компоненты</small>
          </article>
          <article className={`ad-metric ${contourOk ? '' : 'ad-metric--warn'}`}>
            <span>Состояние контура</span>
            <strong>{contourOk ? 'норма' : 'внимание'}</strong>
            <small>{contourOk ? 'все слои отвечают' : 'есть отклонения'}</small>
          </article>
          <article className="ad-metric">
            <span>Локальная БД</span>
            <strong>{dbService?.running ? 'онлайн' : 'стоп'}</strong>
            <small>PostgreSQL учебного контура</small>
          </article>
        </div>
      </section>

      <section className="ad-surface ad-contour" aria-label="Состояние учебного контура">
        <div className="ad-contour-banner" aria-hidden="true">
          <img src={dispatchCenter} alt="" />
        </div>
        <div className="ad-surface-head">
          <div>
            <p className="ad-kicker">Мониторинг слоёв</p>
            <h2>Состояние учебного контура</h2>
          </div>
          <span className="ad-help">Проверка API живая · остальные слои — локальный контур</span>
        </div>
        <div className="ad-services">
          {props.services.map((service) => {
            const view = SERVICE_VIEW[service.id];
            const state = resolveServiceView(service, {
              api: props.apiStatus,
              realtime: props.realtimeStatus,
              dbLive: Boolean(dbService?.running),
            });
            const tone = serviceTone(state);
            return (
              <article key={service.id} className={`ad-service is-${tone}`}>
                <span className="ad-service-rail" aria-hidden="true" />
                <div className="ad-service-copy">
                  <strong>{view.title}</strong>
                  <span>{view.layer}</span>
                </div>
                <span className={`ad-pill is-${tone}`}>{serviceStatusLabel(state)}</span>
              </article>
            );
          })}
        </div>
      </section>

      <div className="ad-split">
        <section className="ad-surface" aria-label="Последние события">
          <div className="ad-surface-head">
            <div>
              <p className="ad-kicker">Журнал</p>
              <h2>Последние события</h2>
            </div>
            <span className="ad-help">Действия администратора и контура</span>
          </div>
          <div className="ad-event-list">
            {props.audit.slice(0, 6).map((entry) => (
              <article key={entry.id} className="ad-event">
                <time className="mono" dateTime={entry.at}>
                  {formatWhen(entry.at)}
                </time>
                <div>
                  <strong>{entry.action}</strong>
                  <span>
                    {entry.actor} · {entry.target}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="ad-surface" aria-label="Активность учётных записей">
          <div className="ad-surface-head">
            <div>
              <p className="ad-kicker">Учётки</p>
              <h2>Активность учётных записей</h2>
            </div>
            <span className="ad-help">Средний балл группы {avg}%</span>
          </div>
          <div className="ad-account-list">
            {recentUsers.map((user) => {
              const item = props.progress.find((entry) => entry.userId === user.id);
              return (
                <article key={user.id} className="ad-account-row">
                  <div>
                    <strong>{user.name}</strong>
                    <span className="mono">{user.login}</span>
                  </div>
                  <span className="ad-role">{roleShort(user.role)}</span>
                  <span className={`ad-pill is-${user.status === 'active' ? 'ok' : 'bad'}`}>
                    {user.status === 'active' ? 'Активна' : 'Блок'}
                  </span>
                  <small>
                    {item
                      ? `${item.lessonsDone}/${item.lessonsTotal} · ${item.lastScore}%`
                      : formatWhen(user.createdAt)}
                  </small>
                </article>
              );
            })}
          </div>
        </section>
      </div>

      <div className="ad-split ad-split--bottom">
        <section className="ad-surface" aria-label="Резервное копирование">
          <div className="ad-surface-head">
            <div>
              <p className="ad-kicker">Хранение</p>
              <h2>Резервное копирование</h2>
            </div>
            <span className="ad-help">Локальный снимок, не реже раза в сутки</span>
          </div>
          <div className="ad-backup-grid">
            <article className="ad-backup-stat">
              <span>Последняя копия</span>
              <strong>{formatWhen(props.settings.lastBackupAt)}</strong>
              <small>снимок локальной БД</small>
            </article>
            <article className="ad-backup-stat">
              <span>Расписание</span>
              <strong>{props.settings.backupHour}</strong>
              <small>ежедневный запуск</small>
            </article>
            <article className="ad-backup-stat">
              <span>Журналы</span>
              <strong>{props.settings.logRetentionDays} дн.</strong>
              <small>уровень {props.settings.logLevel}</small>
            </article>
          </div>
        </section>

        <section className="ad-surface" aria-label="Локальная среда">
          <div className="ad-surface-head">
            <div>
              <p className="ad-kicker">Стенд</p>
              <h2>Локальная среда</h2>
            </div>
            <span className="ad-help">Учебный комплекс на этой машине</span>
          </div>
          <div className="ad-env-list">
            <article className="ad-env-item">
              <span>Узел</span>
              <strong className="mono">{host}</strong>
            </article>
            <article className="ad-env-item">
              <span>Контур</span>
              <strong className="mono">{origin}</strong>
            </article>
            <article className="ad-env-item">
              <span>SIP / VoIP</span>
              <strong className="mono">
                {props.settings.sipHost}:{props.settings.sipPort} · {props.settings.codec}
              </strong>
            </article>
            <article className="ad-env-item">
              <span>Политики</span>
              <strong>
                TLS {props.settings.tls ? 'вкл.' : 'выкл.'} · RBAC {props.settings.rbac ? 'вкл.' : 'выкл.'}
              </strong>
            </article>
          </div>
        </section>
      </div>
    </div>
  );
}

function liveLabel(status: ConnectionStatus) {
  if (status === 'ok') {
    return 'доступен';
  }
  if (status === 'pending') {
    return 'проверка';
  }
  return 'нет ответа';
}

function roleShort(role: AdminUser['role']) {
  if (role === 'ADMIN') {
    return 'Админ.';
  }
  if (role === 'TEACHER') {
    return 'Преп.';
  }
  return 'Обуч.';
}
