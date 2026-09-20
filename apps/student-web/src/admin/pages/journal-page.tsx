import { useMemo, useState } from 'react';
import { AdminFilterMenu, AdminSearchField } from '../components/admin-filter-menu';
import {
  AUDIT_EVENT_LABEL,
  AUDIT_SEVERITY_LABEL,
  type AuditEntry,
  type AuditEventType,
  type AuditSeverity,
} from '../data/admin';
import { formatWhenFull } from '../data/admin';
import { filterAudit, uniqueActors, type AuditOrder } from '../data/audit-query';

type Props = {
  audit: AuditEntry[];
};

const EVENT_FILTERS: Array<AuditEventType | 'all'> = [
  'all',
  'login',
  'logout',
  'account_created',
  'account_blocked',
  'account_unblocked',
  'role_changed',
  'password_reset',
  'backup_created',
  'service_started',
  'service_stopped',
  'service_error',
  'training_completed',
];

type OpenMenu = 'event' | 'actor' | 'order' | 'severity' | null;

export function JournalPage(props: Props) {
  const [query, setQuery] = useState('');
  const [eventType, setEventType] = useState<AuditEventType | 'all'>('all');
  const [actor, setActor] = useState('all');
  const [severity, setSeverity] = useState<AuditSeverity | 'all'>('all');
  const [order, setOrder] = useState<AuditOrder>('desc');
  const [open, setOpen] = useState<OpenMenu>(null);

  const actors = useMemo(() => uniqueActors(props.audit), [props.audit]);
  const rows = useMemo(
    () => filterAudit(props.audit, { query, eventType, actor, severity, order }),
    [actor, eventType, order, props.audit, query, severity],
  );

  return (
    <div className="ad-page">
      <header className="ad-page-head">
        <div>
          <p className="ad-kicker">Аудит действий</p>
          <h1>Журнал</h1>
          <p className="ad-lead">
            Единый локальный журнал учебного контура: вход, учётки, сервисы, копии и сессии. Записи
            сохраняются на этой машине.
          </p>
        </div>
        <div className="ad-health-flag">
          <span className="ad-health-pulse" aria-hidden="true" />
          <div>
            <strong>{props.audit.length} событий</strong>
            <small>локальный репозиторий аудита</small>
          </div>
        </div>
      </header>

      <section className="ad-audit-toolbar" aria-label="Фильтры журнала">
        <AdminSearchField
          label="Поиск"
          value={query}
          placeholder="Актор, тип, объект, детали"
          onChange={setQuery}
        />
        <AdminFilterMenu
          label="Тип события"
          value={eventType}
          options={EVENT_FILTERS.map((value) => ({
            value,
            label: value === 'all' ? 'Все типы' : AUDIT_EVENT_LABEL[value],
          }))}
          open={open === 'event'}
          onOpenChange={(next) => setOpen(next ? 'event' : null)}
          onChange={(value) => setEventType(value as AuditEventType | 'all')}
        />
        <AdminFilterMenu
          label="Актор"
          value={actor}
          options={[{ value: 'all', label: 'Все' }, ...actors.map((name) => ({ value: name, label: name }))]}
          open={open === 'actor'}
          onOpenChange={(next) => setOpen(next ? 'actor' : null)}
          onChange={setActor}
        />
        <AdminFilterMenu
          label="Категория"
          value={severity}
          options={[
            { value: 'all', label: 'Все' },
            { value: 'info', label: AUDIT_SEVERITY_LABEL.info },
            { value: 'ok', label: AUDIT_SEVERITY_LABEL.ok },
            { value: 'warn', label: AUDIT_SEVERITY_LABEL.warn },
            { value: 'error', label: AUDIT_SEVERITY_LABEL.error },
          ]}
          open={open === 'severity'}
          onOpenChange={(next) => setOpen(next ? 'severity' : null)}
          onChange={(value) => setSeverity(value as AuditSeverity | 'all')}
        />
        <AdminFilterMenu
          label="Порядок"
          value={order}
          options={[
            { value: 'desc', label: 'Сначала новые' },
            { value: 'asc', label: 'Сначала старые' },
          ]}
          open={open === 'order'}
          onOpenChange={(next) => setOpen(next ? 'order' : null)}
          onChange={(value) => setOrder(value as AuditOrder)}
        />
      </section>

      <section className="ad-surface" aria-label="Лента аудита">
        <div className="ad-surface-head">
          <div>
            <p className="ad-kicker">Лента</p>
            <h2>События контура</h2>
          </div>
          <span className="ad-help">
            {rows.length} из {props.audit.length}
          </span>
        </div>
        {rows.length === 0 ? (
          <p className="ad-lead">Нет записей по выбранным условиям.</p>
        ) : (
          <div className="ad-audit-list">
            {rows.map((entry) => (
              <article key={entry.id} className={`ad-event ad-audit-row is-${entry.severity}`}>
                <time className="mono" dateTime={entry.at}>
                  {formatWhenFull(entry.at)}
                </time>
                <div>
                  <strong>{entry.action}</strong>
                  <span>
                    {entry.actor}
                    {entry.actorLogin ? ` · ${entry.actorLogin}` : ''}
                  </span>
                  <span>{entry.target}</span>
                  <span>{entry.details}</span>
                </div>
                <span className={`ad-pill is-${severityTone(entry.severity)}`}>
                  {AUDIT_EVENT_LABEL[entry.eventType]}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function severityTone(severity: AuditEntry['severity']): 'ok' | 'warn' | 'bad' {
  if (severity === 'error') {
    return 'bad';
  }
  if (severity === 'warn') {
    return 'warn';
  }
  return 'ok';
}
