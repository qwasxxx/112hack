import { readArmDraft } from './draft-store';

export type LiveCardRow = {
  key: string;
  label: string;
  value: string;
  filled: boolean;
};

export type LiveCardSnapshot = {
  percent: number;
  found: number;
  missed: number;
  phase: string;
  fields: Record<string, string>;
  rows: LiveCardRow[];
};

const DDS_KEY = (login: string) => `sys112.draft.dds.v1.${login}`;

export type DdsHint = {
  scenarioId: string;
  done: number;
  total: number;
  services: number;
  card?: string;
  status?: string;
  naryad?: string;
  address?: string;
  injured?: string;
  caller?: string;
  contacts?: string;
  history?: string;
  savedAt: string;
};

export function writeDdsHint(login: string, hint: Omit<DdsHint, 'savedAt'>): void {
  if (typeof localStorage === 'undefined' || !login) {
    return;
  }
  localStorage.setItem(DDS_KEY(login), JSON.stringify({ ...hint, savedAt: new Date().toISOString() }));
}

export function readDdsHint(login: string, scenarioId: string): DdsHint | null {
  if (typeof localStorage === 'undefined' || !login) {
    return null;
  }
  try {
    const raw = localStorage.getItem(DDS_KEY(login));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as DdsHint;
    if (parsed.scenarioId !== scenarioId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearDdsHint(login: string): void {
  if (typeof localStorage === 'undefined' || !login) {
    return;
  }
  localStorage.removeItem(DDS_KEY(login));
}

function filled(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value === 'boolean') {
    return true;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return value != null;
}

function pack(rows: LiveCardRow[], percent: number, phase: string): LiveCardSnapshot {
  const found = rows.filter((row) => row.key !== 'phase' && row.filled).length;
  const tracked = rows.filter((row) => row.key !== 'phase').length;
  const fields: Record<string, string> = {};
  for (const row of rows) {
    fields[row.label] = row.value;
  }
  return {
    percent: Math.min(100, percent),
    found,
    missed: Math.max(0, tracked - found),
    phase,
    fields,
    rows,
  };
}

export function liveCardSnapshot(
  login: string,
  scenarioId: string,
  mode: 'training' | 'exam' | 'dds',
): LiveCardSnapshot {
  if (mode === 'dds') {
    const hint = readDdsHint(login, scenarioId);
    const done = hint?.done ?? 0;
    const total = hint?.total ?? 0;
    const rows: LiveCardRow[] = [
      { key: 'card', label: 'Карточка', value: hint?.card ?? '', filled: Boolean(hint?.card) },
      { key: 'status', label: 'Статус', value: hint?.status ?? '', filled: Boolean(hint?.status && hint.status !== 'Добавлена') },
      { key: 'naryad', label: 'Наряд', value: hint?.naryad ?? '', filled: Boolean(hint?.naryad) },
      { key: 'address', label: 'Адрес', value: hint?.address ?? '', filled: Boolean(hint?.address) },
      { key: 'injured', label: 'Пострадавшие', value: hint?.injured ?? '', filled: Boolean(hint?.injured) },
      { key: 'caller', label: 'ФИО', value: hint?.caller ?? '', filled: Boolean(hint?.caller) },
      { key: 'contacts', label: 'Связался', value: hint?.contacts ?? '', filled: Boolean(hint?.contacts) },
      { key: 'history', label: 'Ход статусов', value: hint?.history ?? '', filled: Boolean(hint?.history) },
      {
        key: 'processed',
        label: 'Обработано',
        value: total ? `${done} из ${total}` : '',
        filled: total > 0,
      },
    ];
    const percent = total > 0 ? Math.max(12, Math.round((done / total) * 100)) : 8;
    return pack(rows, percent, '');
  }

  const draft = readArmDraft(login, scenarioId);
  const card = draft?.card;
  const callerBits = [
    card?.caller.familyNameAndGivenName,
    card?.caller.callerStatus,
  ].filter((item) => filled(item));
  const phone = [card?.caller.providedNumber, card?.caller.phoneOnScene, card?.caller.aon].find((item) =>
    filled(item),
  );
  const address = [
    card?.address.street,
    card?.address.house,
    card?.address.apartment ? `кв. ${card.address.apartment}` : '',
    card?.address.descriptiveAddress,
  ]
    .filter((item) => filled(item))
    .join(', ');
  const klass =
    card?.classification.selectedTypes.join(', ') ||
    card?.classification.classifier.matchedNumbers.join(', ') ||
    '';
  const injured =
    card?.injured.hasInjured == null
      ? ''
      : card.injured.hasInjured
        ? card.injured.count != null
          ? `есть, ${card.injured.count}`
          : 'есть'
        : 'нет';
  const services = (card?.services ?? []).map((item) => item.name).filter(Boolean).join(', ');
  const phase = draft?.phase || 'ожидание';
  const rows: LiveCardRow[] = [
    {
      key: 'what',
      label: 'Что случилось',
      value: card?.descriptionFromCaller?.trim() ?? '',
      filled: filled(card?.descriptionFromCaller),
    },
    {
      key: 'caller',
      label: 'Заявитель',
      value: callerBits.join(' · '),
      filled: callerBits.length > 0,
    },
    {
      key: 'phone',
      label: 'Телефон',
      value: phone ?? '',
      filled: filled(phone),
    },
    { key: 'address', label: 'Адрес', value: address, filled: Boolean(address) },
    { key: 'type', label: 'Классификатор', value: klass, filled: Boolean(klass) },
    { key: 'injured', label: 'Пострадавшие', value: injured, filled: Boolean(injured) },
    { key: 'services', label: 'Службы', value: services, filled: Boolean(services) },
    { key: 'phase', label: 'Фаза АРМ', value: phase, filled: Boolean(phase && phase !== 'ожидание') },
  ];
  const tracked = rows.filter((row) => row.key !== 'phase');
  let percent = Math.round((tracked.filter((row) => row.filled).length / Math.max(tracked.length, 1)) * 100);
  if (draft?.phase === 'просмотр карточки') {
    percent = Math.max(percent, 88);
  }
  if (draft?.phase === 'активный вызов') {
    percent = Math.max(percent, 18);
  }
  if (!draft) {
    percent = 0;
  }
  return pack(rows, percent, phase);
}
