import { useEffect, useState } from 'react';
import { AdminFilterMenu } from '../components/admin-filter-menu';
import type { BackupRecord, ContourSettings, ServiceRecord } from '../data/admin';
import { CONTOUR_RUNTIME, formatUptime, formatWhen, formatWhenFull } from '../data/admin';
import {
  resolveServiceView,
  serviceActionDanger,
  serviceActionDisabled,
  serviceActionLabel,
  serviceStatusLabel,
  serviceTone,
  type ConnectionStatus,
} from '../data/service-status';
import { probeLocalDatabase } from '../data/system-persistence';

type Props = {
  services: ServiceRecord[];
  settings: ContourSettings;
  backups: BackupRecord[];
  auditCount: number;
  lastAuditAt?: string;
  userCount: number;
  busyIds: ReadonlySet<ServiceRecord['id']>;
  apiStatus: ConnectionStatus;
  realtimeStatus: ConnectionStatus;
  onToggleService: (id: ServiceRecord['id']) => void;
  onSettings: (next: ContourSettings) => void;
  onBackup: () => void;
};

const CODEC_OPTIONS = [
  { value: 'G.711', label: 'G.711' },
  { value: 'G.722', label: 'G.722' },
  { value: 'Opus', label: 'Opus' },
];

export function ContourPage(props: Props) {
  const [dbLive, setDbLive] = useState(true);
  const [codecOpen, setCodecOpen] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void probeLocalDatabase().then((ok) => {
      if (!cancelled) {
        setDbLive(ok);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [props.services]);

  const running = props.services.filter((item) => item.running).length;
  const dbService = props.services.find((item) => item.id === 'postgres');
  const lastBackup = props.backups[0];
  const backupOk = props.settings.lastBackupStatus === 'ok';
  const contourOk =
    running === props.services.length &&
    props.apiStatus !== 'bad' &&
    props.realtimeStatus !== 'bad' &&
    dbLive;
  const availability = props.services.length === 0 ? 0 : Math.round((running / props.services.length) * 100);
  const live = {
    api: props.apiStatus,
    realtime: props.realtimeStatus,
    dbLive,
    busyIds: props.busyIds,
  };

  function patch(partial: Partial<ContourSettings>) {
    props.onSettings({ ...props.settings, ...partial });
  }

  return (
    <div className="ad-page" data-contour-runtime={CONTOUR_RUNTIME}>
      <header className="ad-page-head">
        <div>
          <p className="ad-kicker">Локальный учебный контур</p>
          <h1>Контур</h1>
          <p className="ad-lead">
            Состояние слоёв учебного комплекса на этой машине. Это симуляция: боевые системы вызова 112 не
            задействованы.
          </p>
        </div>
        <div className={`ad-health-flag is-${contourOk ? 'ok' : 'warn'}`}>
          <span className="ad-health-pulse" aria-hidden="true" />
          <div>
            <strong>{contourOk ? 'Контур в штатном режиме' : 'Требует внимания'}</strong>
            <small>
              {running}/{props.services.length} сервисов · локальный прототип
            </small>
          </div>
        </div>
      </header>

      <section className="ad-surface" aria-label="Системное здоровье">
        <div className="ad-surface-head">
          <div>
            <p className="ad-kicker">Мониторинг</p>
            <h2>Системное здоровье</h2>
          </div>
          <span className="ad-help">Локальный стенд, без облака</span>
        </div>
        <div className="ad-metrics ad-health-grid">
          <article className={`ad-metric ad-health-mod ${contourOk ? '' : 'ad-metric--warn'}`}>
            <span>Состояние контура</span>
            <strong>{contourOk ? 'норма' : 'внимание'}</strong>
            <small>{contourOk ? 'все слои отвечают' : 'есть отклонения'}</small>
          </article>
          <article className={`ad-metric ad-health-mod ${dbLive && dbService?.running ? '' : 'ad-metric--warn'}`}>
            <span>Локальная БД</span>
            <strong>{dbLive && dbService?.running ? 'онлайн' : 'сбой'}</strong>
            <small>IndexedDB · {props.userCount} учёток</small>
          </article>
          <article className={`ad-metric ad-health-mod ${backupOk ? '' : 'ad-metric--warn'}`}>
            <span>Хранение / копии</span>
            <strong>{backupOk ? 'готово' : 'ошибка'}</strong>
            <small>{props.backups.length} снимков на этой машине</small>
          </article>
          <article className="ad-metric ad-health-mod ad-metric--accent">
            <span>Доступность сервисов</span>
            <strong>{availability}%</strong>
            <small>
              {running} из {props.services.length} в работе
            </small>
          </article>
          <article className="ad-metric ad-health-mod">
            <span>Последняя копия</span>
            <strong>{formatWhen(props.settings.lastBackupAt)}</strong>
            <small>{backupOk ? 'снимок выполнен' : 'последний снимок с ошибкой'}</small>
          </article>
          <article className="ad-metric ad-health-mod">
            <span>Журнал аудита</span>
            <strong>{props.auditCount}</strong>
            <small>
              {props.lastAuditAt ? `последняя запись ${formatWhen(props.lastAuditAt)}` : 'записей нет'}
            </small>
          </article>
        </div>
      </section>

      <section className="ad-surface" aria-label="Сервисы учебного контура">
        <div className="ad-surface-head">
          <div>
            <p className="ad-kicker">Компоненты</p>
            <h2>Сервисы</h2>
          </div>
          <span className="ad-help">Пуск и останов только для учебного контура этой машины</span>
        </div>
        <div className="ad-services ad-ops-grid">
          {props.services.map((service) => {
            const view = resolveServiceView(service, live);
            const tone = serviceTone(view);
            const disabled = serviceActionDisabled(view);
            return (
              <article key={service.id} className={`ad-service ad-ops-card is-${tone}`}>
                <span className="ad-service-rail" aria-hidden="true" />
                <div className="ad-service-copy">
                  <strong>{service.title}</strong>
                  <span>{service.detail}</span>
                  <div className="ad-ops-meta">
                    <span>
                      Аптайм · {view === 'checking' ? 'проверка' : formatUptime(service.startedAt, service.running)}
                    </span>
                    <span>Смена · {formatWhenFull(service.lastChangeAt)}</span>
                  </div>
                </div>
                <div className="ad-ops-actions">
                  <span className={`ad-pill is-${tone}`}>{serviceStatusLabel(view)}</span>
                  <button
                    type="button"
                    className={`ad-action ${serviceActionDanger(view) ? 'btn btn-danger' : 'btn btn-primary'}`}
                    disabled={disabled}
                    onClick={() => props.onToggleService(service.id)}
                  >
                    {serviceActionLabel(view)}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <div className="ad-split">
        <section className="ad-surface" aria-label="Резервное копирование">
          <div className="ad-surface-head">
            <div>
              <p className="ad-kicker">Хранение</p>
              <h2>Резервное копирование</h2>
            </div>
            <span className="ad-help">Локальный снимок IndexedDB, без выгрузки в облако</span>
          </div>
          <div className="ad-backup-grid">
            <article className="ad-backup-stat">
              <span>Последняя копия</span>
              <strong>{formatWhen(props.settings.lastBackupAt)}</strong>
              <small>
                {backupOk ? 'успешно' : 'ошибка'} · {lastBackup?.kind === 'manual' ? 'вручную' : 'по расписанию'}
              </small>
            </article>
            <article className="ad-backup-stat">
              <span>Расписание</span>
              <strong>{props.settings.backupHour}</strong>
              <small>ежедневный локальный снимок</small>
            </article>
            <article className="ad-backup-stat">
              <span>История</span>
              <strong>{props.backups.length}</strong>
              <small>только метаданные на этой машине</small>
            </article>
          </div>
          <div className="ad-backup-toolbar">
            <button type="button" className="ad-action btn btn-primary" onClick={props.onBackup}>
              Создать резервную копию
            </button>
          </div>
          <div className="ad-backup-history">
            {props.backups.slice(0, 6).map((item) => (
              <article key={item.id} className="ad-event">
                <time className="mono" dateTime={item.at}>
                  {formatWhen(item.at)}
                </time>
                <div>
                  <strong>{item.kind === 'manual' ? 'Ручной снимок' : 'По расписанию'}</strong>
                  <span>
                    {item.status === 'ok' ? 'успешно' : 'ошибка'} · {item.note}
                    {item.userCount != null ? ` · ${item.userCount} учёток` : ''}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="ad-surface" aria-label="Параметры стенда">
          <div className="ad-surface-head">
            <div>
              <p className="ad-kicker">Стенд</p>
              <h2>Локальная среда</h2>
            </div>
            <span className="ad-help">SIP и политики учебного контура</span>
          </div>
          <div className="ad-env-list">
            <article className="ad-env-item">
              <span>Режим</span>
              <strong>локальный прототип</strong>
            </article>
            <article className="ad-env-item">
              <span>Хранение</span>
              <strong>IndexedDB · {dbLive ? 'здорово' : 'нет доступа'}</strong>
            </article>
            <article className="ad-env-item">
              <span>TLS / RBAC</span>
              <strong>
                {props.settings.tls ? 'TLS вкл.' : 'TLS выкл.'} · {props.settings.rbac ? 'RBAC вкл.' : 'RBAC выкл.'}
              </strong>
            </article>
          </div>
          <form className="card-form" onSubmit={(event) => event.preventDefault()}>
            <label className="field">
              <span>SIP-хост</span>
              <input
                value={props.settings.sipHost}
                onChange={(event) => patch({ sipHost: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Порт</span>
              <input
                value={props.settings.sipPort}
                onChange={(event) => patch({ sipPort: event.target.value })}
              />
            </label>
            <AdminFilterMenu
              label="Кодек"
              value={props.settings.codec}
              options={CODEC_OPTIONS}
              open={codecOpen}
              onOpenChange={setCodecOpen}
              onChange={(value) => patch({ codec: value })}
            />
            <label className="field">
              <span>Одновременные сессии</span>
              <input
                value={props.settings.maxSessions}
                onChange={(event) => patch({ maxSessions: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Время ежедневной копии</span>
              <input
                type="time"
                value={props.settings.backupHour}
                onChange={(event) => patch({ backupHour: event.target.value })}
              />
            </label>
          </form>
        </section>
      </div>
    </div>
  );
}
