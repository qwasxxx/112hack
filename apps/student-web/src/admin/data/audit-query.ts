import { AUDIT_EVENT_LABEL, type AuditEntry, type AuditEventType, type AuditSeverity } from './admin';

export type AuditOrder = 'desc' | 'asc';

export type AuditFilter = {
  query?: string;
  eventType?: AuditEventType | 'all';
  actor?: string;
  severity?: AuditSeverity | 'all';
  order?: AuditOrder;
};

export function filterAudit(entries: AuditEntry[], filter: AuditFilter): AuditEntry[] {
  const needle = filter.query?.trim().toLowerCase() ?? '';
  const eventType = filter.eventType ?? 'all';
  const actor = filter.actor ?? 'all';
  const severity = filter.severity ?? 'all';
  const order = filter.order ?? 'desc';
  const seen = new Set<string>();
  const filtered = entries.filter((entry) => {
    if (seen.has(entry.id)) {
      return false;
    }
    seen.add(entry.id);
    if (eventType !== 'all' && entry.eventType !== eventType) {
      return false;
    }
    if (actor !== 'all' && entry.actor !== actor) {
      return false;
    }
    if (severity !== 'all' && entry.severity !== severity) {
      return false;
    }
    if (!needle) {
      return true;
    }
    const haystack = [
      entry.actor,
      entry.actorLogin ?? '',
      entry.action,
      entry.target,
      entry.details,
      AUDIT_EVENT_LABEL[entry.eventType],
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(needle);
  });
  return [...filtered].sort((a, b) => {
    const delta = new Date(a.at).getTime() - new Date(b.at).getTime();
    return order === 'desc' ? -delta : delta;
  });
}

export function uniqueActors(entries: AuditEntry[]): string[] {
  return [...new Set(entries.map((entry) => entry.actor))].sort((a, b) => a.localeCompare(b, 'ru'));
}
