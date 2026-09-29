import { useEffect, useMemo, useState } from 'react';
import type { InterventionType, ScenarioDifficulty } from '@sys112/shared-types';
import type { Scenario, ScenarioDraft, TrainingMaterial } from '../../domain/entities';
import { difficultyLabels, formatDateTime } from '../../domain/value-objects';
import { StatusBadge } from '../components/common';
import { readCoachNote, writeCoachNote } from '../../../../../student-web/src/progress/coach-notes';
import { SERVICE_LABEL, type ServiceKind } from '../../../../../student-web/src/data/scenarios';
import { generateTicket, inferServices, ticketTitle } from '../../../../../student-web/src/lib/generate-ticket';
import { ticketFactsFrom, serviceLabels } from '../../../../../student-web/src/progress/ticket-facts';
import { exportCatalogJson } from '../../../../../student-web/src/data/ticket-catalog';

const SERVICE_OPTIONS: Array<{ id: ServiceKind; label: string }> = [
  { id: 'fire', label: SERVICE_LABEL.fire },
  { id: 'ambulance', label: SERVICE_LABEL.ambulance },
  { id: 'police', label: SERVICE_LABEL.police },
  { id: 'gas', label: SERVICE_LABEL.gas },
];

const interventionOptions: Array<{ value: InterventionType; label: string }> = [
  { value: 'set_emotional_state', label: 'Эмоции' },
  { value: 'add_circumstance', label: 'Обстоятельство' },
  { value: 'inject_event', label: 'Внезапное событие' },
  { value: 'force_state', label: 'Смена фазы' },
  { value: 'reveal_fact', label: 'Открыть факт' },
  { value: 'conceal_fact', label: 'Скрыть факт' },
  { value: 'adjust_difficulty', label: 'Сложность' },
  { value: 'end_call', label: 'Завершение' },
];

const emptyDraft = (): ScenarioDraft => ({
  title: '',
  category: 'Полиция',
  location: '',
  difficulty: 'standard',
  description: '',
  timeLimitSec: 30,
  requiredActions: [
    'Представиться как оператор 112',
    'Получить точный адрес',
    'Выяснить суть происшествия',
    'Уточнить пострадавших / угрозу',
    'Зафиксировать телефон заявителя',
    'Заполнить карточку происшествия',
  ],
  allowedErrors: 1,
  passThreshold: 70,
  materials: ['Справочные материалы АРМ-112'],
  allowedInterventions: ['set_emotional_state', 'add_circumstance', 'inject_event', 'force_state', 'end_call'],
  services: [],
  callerOpening: '',
  classifierNumber: '',
});

function asServices(values?: string[]): ServiceKind[] {
  const allowed: ServiceKind[] = ['fire', 'ambulance', 'police', 'gas'];
  return (values ?? []).filter((item): item is ServiceKind => allowed.includes(item as ServiceKind));
}

function keepOrFill(current: string, next: string): string {
  const kept = current.trim();
  return kept || next;
}

const GEN_STEPS = ['Читаю название', 'Собираю обстановку', 'Пишу адрес и заявителя', 'Сверяю эталон'];

function TicketGenOverlay() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setStep((current) => (current + 1) % GEN_STEPS.length), 1400);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="td-ticket-gen" aria-live="polite" aria-busy="true">
      <div className="td-ticket-gen-card">
        <div className="td-ticket-gen-mark" aria-hidden="true">
          <i />
          <i />
          <i />
          <span>112</span>
        </div>
        <strong>Пишу билет</strong>
        <p>{GEN_STEPS[step]}</p>
        <ul>
          <li />
          <li />
          <li />
        </ul>
      </div>
    </div>
  );
}

function ScenarioForm({
  scenario,
  onSave,
  onCancel,
}: {
  scenario?: Scenario;
  onSave: (draft: ScenarioDraft) => Promise<{ id: string } | void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<ScenarioDraft>(() =>
    scenario
      ? {
          ...emptyDraft(),
          ...scenario,
          services: scenario.services?.length ? scenario.services : asServices([scenario.category]),
          callerOpening: scenario.callerOpening ?? '',
          classifierNumber: scenario.classifierNumber ?? '',
        }
      : emptyDraft(),
  );
  const [actions, setActions] = useState(scenario?.requiredActions.join('\n') ?? emptyDraft().requiredActions.join('\n'));
  const [coach, setCoach] = useState(() => (scenario ? readCoachNote(scenario.id) : { approved: false, note: '' }));
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [genOk, setGenOk] = useState('');
  const field = <K extends keyof ScenarioDraft>(key: K, value: ScenarioDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const services = asServices(draft.services);
  const preview = useMemo(() => {
    return ticketFactsFrom({
      id: scenario?.id ?? 'preview',
      code: 'К',
      title: draft.title,
      summary: draft.description,
      situation: draft.description,
      address: draft.location,
      services: services.length ? services : ['police'],
      durationMin: 8,
      difficulty: 'стандарт',
      theory: [],
      checklist: [],
      callerOpening: draft.callerOpening || '',
      cardFields: [],
    });
  }, [draft.callerOpening, draft.description, draft.location, draft.title, scenario?.id, services]);

  const toggleService = (id: ServiceKind) => {
    const next = services.includes(id) ? services.filter((item) => item !== id) : [...services, id];
    field('services', next.length ? next : [id]);
  };

  async function fillFromModel() {
    setGenerating(true);
    setGenError('');
    setGenOk('');
    const inferred = inferServices(draft.title, draft.description, draft.callerOpening);
    const result = await generateTicket({
      services: inferred.length ? inferred : services.length ? services : [],
      title: draft.title,
      situation: draft.description,
      address: draft.location,
      opening: draft.callerOpening,
      classifier: draft.classifierNumber,
      difficulty: draft.difficulty,
    });
    setGenerating(false);
    if (!result.ok) {
      setGenError(result.message);
      return;
    }
    const ticket = result.ticket;
    setDraft((current) => ({
      ...current,
      title: ticketTitle(ticket, current.title),
      description: keepOrFill(current.description, ticket.situation),
      location: keepOrFill(current.location, ticket.address),
      callerOpening: keepOrFill(current.callerOpening ?? '', ticket.opening),
      services: ticket.services,
      category: ticket.services.map((item) => SERVICE_LABEL[item]).join(', '),
    }));
    setGenOk(
      draft.title.trim()
        ? 'Дописала пустые поля по названию. Уже заполненное не трогала.'
        : 'Черновик собран. Название можно поправить вручную.',
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const saved = await onSave({
        ...draft,
        category: (services.length ? services : (['police'] as ServiceKind[])).map((item) => SERVICE_LABEL[item]).join(', '),
        requiredActions: actions
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean),
        services: services.length ? services : ['police'],
      });
      const id = scenario?.id ?? saved?.id;
      if (id) {
        writeCoachNote(id, coach);
      }
      onCancel();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className={`td-panel td-form td-ticket-builder${generating ? ' is-generating' : ''}`} onSubmit={(event) => void submit(event)}>
      {generating ? <TicketGenOverlay /> : null}
      <div className="td-section-title">
        <div>
          <p className="td-kicker">Билет для линии</p>
          <h3>{scenario ? 'Редактирование билета' : 'Новый билет'}</h3>
        </div>
        <button type="button" className="td-icon-btn" onClick={onCancel} aria-label="Закрыть форму">
          ×
        </button>
      </div>

      <div className="td-ticket-shell">
        <div className="td-ticket-main">
          <div className="td-ticket-title-row">
            <label>
              Название
              <input
                required
                autoFocus={!scenario}
                value={draft.title}
                placeholder="Например: ДТП на МКАД, звонит свидетель"
                onChange={(e) => field('title', e.target.value)}
              />
            </label>
            <button
              type="button"
              className="td-btn td-btn--primary"
              disabled={generating}
              onClick={() => void fillFromModel()}
            >
              {generating ? 'Дописываю…' : 'Дописать билет'}
            </button>
          </div>
          <p className="td-ticket-help">
            Пустые поля карточки можно дописать по названию. Уже вписанное не затирается.
          </p>
          {genError ? <p className="td-ticket-alert">{genError}</p> : null}
          {genOk ? <p className="td-ticket-ok">{genOk}</p> : null}

          <h4 className="td-ticket-h">Карточка</h4>
          <div className="td-form-grid">
            <label>
              Сложность
              <select
                value={draft.difficulty}
                onChange={(e) => field('difficulty', e.target.value as ScenarioDifficulty)}
              >
                {Object.entries(difficultyLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Классификатор
              <input
                value={draft.classifierNumber ?? ''}
                placeholder="например 1050101"
                onChange={(e) => field('classifierNumber', e.target.value)}
              />
            </label>
            <label className="td-span-2">
              Что случилось
              <textarea
                required
                rows={5}
                placeholder="Суть, кто звонит, телефон, пострадавшие. Оператор этого текста не видит."
                value={draft.description}
                onChange={(e) => field('description', e.target.value)}
              />
            </label>
            <label className="td-span-2">
              Адрес
              <textarea
                required
                rows={2}
                placeholder="Город, улица, дом, корпус, подъезд, квартира"
                value={draft.location}
                onChange={(e) => field('location', e.target.value)}
              />
            </label>
            <label className="td-span-2">
              Первая фраза заявителя
              <input
                value={draft.callerOpening ?? ''}
                placeholder="Помогите, у нас дым в подъезде"
                onChange={(e) => field('callerOpening', e.target.value)}
              />
            </label>
          </div>

          <h4 className="td-ticket-h">Службы</h4>
          <div className="td-class-cats">
            {SERVICE_OPTIONS.map((item) => (
              <label key={item.id}>
                <input type="checkbox" checked={services.includes(item.id)} onChange={() => toggleService(item.id)} />
                {item.label}
              </label>
            ))}
          </div>

          <h4 className="td-ticket-h">Как ведёт себя заявитель</h4>
          <label>
            Не входит в сверку карточки
            <textarea
              rows={3}
              value={coach.note}
              placeholder="Напуган, говорит коротко. Пострадавший без сознания, дышит. Адрес и телефон сюда не пишите."
              onChange={(e) => setCoach((current) => ({ ...current, note: e.target.value }))}
            />
          </label>

          <details className="td-ticket-more">
            <summary>Нормативы и вмешательства</summary>
            <div className="td-form-grid">
              <label>
                Лимит карточки, сек.
                <input
                  type="number"
                  min="10"
                  required
                  value={draft.timeLimitSec}
                  onChange={(e) => field('timeLimitSec', Number(e.target.value))}
                />
              </label>
              <label>
                Допустимо ошибок
                <input
                  type="number"
                  min="0"
                  value={draft.allowedErrors}
                  onChange={(e) => field('allowedErrors', Number(e.target.value))}
                />
              </label>
              <label>
                Порог успешности, %
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={draft.passThreshold}
                  onChange={(e) => field('passThreshold', Number(e.target.value))}
                />
              </label>
              <label className="td-span-2">
                Обязательные действия оператора
                <textarea required rows={5} value={actions} onChange={(e) => setActions(e.target.value)} />
              </label>
            </div>
            <fieldset>
              <legend>Вмешательства преподавателя во время звонка</legend>
              <div className="td-checkboxes">
                {interventionOptions.map((option) => (
                  <label key={option.value}>
                    <input
                      type="checkbox"
                      checked={draft.allowedInterventions.includes(option.value)}
                      onChange={(e) =>
                        field(
                          'allowedInterventions',
                          e.target.checked
                            ? [...draft.allowedInterventions, option.value]
                            : draft.allowedInterventions.filter((item) => item !== option.value),
                        )
                      }
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </details>
        </div>

        <aside className="td-ticket-preview" aria-label="Сверка оценки">
          <p className="td-kicker">Сверка оценки</p>
          <p className="td-ticket-help">
            Карточка ученика сравнивается с этими строками. Они читаются из полей слева, отдельно их не
            заполняют.
          </p>
          <dl>
            <div>
              <dt>Суть</dt>
              <dd>{preview.what || 'Появится из «Что случилось»'}</dd>
            </div>
            <div>
              <dt>Адрес</dt>
              <dd>{preview.address || 'Появится из адреса'}</dd>
            </div>
            <div>
              <dt>Заявитель</dt>
              <dd>{preview.callerFio || preview.callerRole || 'ФИО должно быть в тексте «Что случилось»'}</dd>
            </div>
            <div>
              <dt>Телефон</dt>
              <dd>{preview.phone || 'Номер должен быть в тексте «Что случилось»'}</dd>
            </div>
            <div>
              <dt>Службы</dt>
              <dd>{serviceLabels(preview.services) || '—'}</dd>
            </div>
          </dl>
        </aside>
      </div>

      <div className="td-form-actions">
        <button type="button" className="td-btn td-btn--ghost" onClick={onCancel}>
          Отмена
        </button>
        <button disabled={saving} className="td-btn td-btn--primary">
          {saving ? 'Сохранение…' : scenario ? 'Сохранить билет' : 'Создать билет'}
        </button>
      </div>
    </form>
  );
}

export function ScenariosPage({
  scenarios,
  materials,
  onSave,
  onImport,
}: {
  scenarios: Scenario[];
  materials: TrainingMaterial[];
  onSave: (draft: ScenarioDraft) => Promise<{ id: string } | void>;
  onImport?: (raw: string) => Promise<{ added: number; updated: number } | void>;
}) {
  const [editing, setEditing] = useState<Scenario | 'new' | null>(null);
  const [query, setQuery] = useState('');
  const [importing, setImporting] = useState(false);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return scenarios;
    }
    return scenarios.filter((item) =>
      `${item.title} ${item.location} ${item.description} ${item.category}`.toLowerCase().includes(needle),
    );
  }, [query, scenarios]);

  return (
    <div className="td-page">
      <header className="td-page-head">
        <div>
          <p className="td-kicker">Учебный контент</p>
          <h2>Билеты и сценарии</h2>
        </div>
        <div className="td-inline">
          <button
            className="td-btn td-btn--ghost"
            type="button"
            onClick={() => {
              const blob = new Blob([exportCatalogJson()], { type: 'application/json' });
              const href = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = href;
              link.download = 'sys112-tickets.json';
              link.click();
              URL.revokeObjectURL(href);
            }}
          >
            Экспорт JSON
          </button>
          <label className="td-btn td-btn--secondary">
            {importing ? 'Импорт…' : 'Импорт JSON'}
            <input
              type="file"
              accept="application/json,.json"
              hidden
              disabled={importing || !onImport}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file || !onImport) {
                  return;
                }
                setImporting(true);
                void file
                  .text()
                  .then((raw) => onImport(raw))
                  .finally(() => setImporting(false));
              }}
            />
          </label>
          <button
            className="td-btn td-btn--primary"
            type="button"
            onClick={() => setEditing('new')}
          >
            + Новый билет
          </button>
        </div>
      </header>
      {editing && (
        <ScenarioForm
          scenario={editing === 'new' ? undefined : editing}
          onSave={onSave}
          onCancel={() => setEditing(null)}
        />
      )}
      <section className="td-panel">
        <div className="td-section-title">
          <h3>Билеты АГС</h3>
          <span>
            {visible.length} из {scenarios.length}
          </span>
        </div>
        <label className="td-ticket-search">
          Поиск
          <input value={query} placeholder="адрес, суть, служба…" onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="td-card-list">
          {visible.map((scenario) => {
            return (
              <article className="td-scenario-card" key={scenario.id}>
                <div>
                  <div className="td-inline">
                    <StatusBadge
                      tone={
                        scenario.status === 'active' ? 'good' : scenario.status === 'archived' ? 'neutral' : 'warning'
                      }
                    >
                      {scenario.status === 'active' ? 'Назначен' : scenario.status === 'archived' ? 'Снят' : 'Черновик'}
                    </StatusBadge>
                    <span>{scenario.category}</span>
                  </div>
                  <h4>{scenario.title}</h4>
                  <p>{scenario.location || 'Адрес не указан'}</p>
                  <p>{scenario.description}</p>
                </div>
                <dl>
                  <div>
                    <dt>Назначен</dt>
                    <dd>{scenario.assignments ? 'да' : 'нет'}</dd>
                  </div>
                  <div>
                    <dt>Лимит</dt>
                    <dd>{scenario.timeLimitSec} сек.</dd>
                  </div>
                  <div>
                    <dt>Изменён</dt>
                    <dd>{formatDateTime(scenario.updatedAt)}</dd>
                  </div>
                </dl>
                <div className="td-card-actions">
                  <button className="td-btn td-btn--secondary" onClick={() => setEditing(scenario)}>
                    Открыть
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
      {materials.length ? (
        <section className="td-panel">
          <div className="td-section-title">
            <h3>Учебные материалы</h3>
          </div>
          <div className="td-table-wrap">
            <table className="td-table">
              <thead>
                <tr>
                  <th>Материал</th>
                  <th>Тип</th>
                  <th>Версия</th>
                  <th>Сценарий</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.title}</strong>
                    </td>
                    <td>{item.fileType}</td>
                    <td>{item.version}</td>
                    <td>{scenarios.find((scenario) => scenario.id === item.scenarioId)?.title ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
