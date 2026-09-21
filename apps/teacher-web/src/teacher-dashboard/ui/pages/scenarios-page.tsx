import { useMemo, useState } from 'react';
import type { InterventionType, ScenarioDifficulty } from '@sys112/shared-types';
import type { Scenario, ScenarioDraft, TrainingMaterial } from '../../domain/entities';
import { difficultyLabels, formatDateTime } from '../../domain/value-objects';
import { StatusBadge } from '../components/common';
import { readCoachNote, writeCoachNote } from '../../../../../student-web/src/progress/coach-notes';
import { SERVICE_LABEL, type ServiceKind } from '../../../../../student-web/src/data/scenarios';
import { ticketFactsFrom, serviceLabels } from '../../../../../student-web/src/progress/ticket-facts';

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
  allowedInterventions: ['set_emotional_state', 'add_circumstance', 'inject_event', 'end_call'],
  services: ['police'],
  callerOpening: '',
  classifierNumber: '',
});

function asServices(values?: string[]): ServiceKind[] {
  const allowed: ServiceKind[] = ['fire', 'ambulance', 'police', 'gas'];
  return (values ?? []).filter((item): item is ServiceKind => allowed.includes(item as ServiceKind));
}

function ScenarioForm({
  scenario,
  onSave,
  onCancel,
}: {
  scenario?: Scenario;
  onSave: (draft: ScenarioDraft) => Promise<void>;
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

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave({
        ...draft,
        category: (services.length ? services : (['police'] as ServiceKind[])).map((item) => SERVICE_LABEL[item]).join(', '),
        requiredActions: actions
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean),
        services: services.length ? services : ['police'],
      });
      if (scenario?.id) {
        writeCoachNote(scenario.id, coach);
      }
      onCancel();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="td-panel td-form td-ticket-builder" onSubmit={(event) => void submit(event)}>
      <div className="td-section-title">
        <div>
          <p className="td-kicker">Конструктор билета</p>
          <h3>{scenario ? 'Редактирование билета' : 'Новый билет'}</h3>
        </div>
        <button type="button" className="td-icon-btn" onClick={onCancel} aria-label="Закрыть форму">
          ×
        </button>
      </div>
      <p className="td-ticket-help">
        Сюда пишется то, что знает заявитель: суть, ФИО, телефон, детали. Оператор этого текста не видит —
        он выясняет его на линии и заносит в карточку. Короткая строка «тренировка оператора 112…» — это
        подпись каталога, не сам билет.
      </p>

      <h4 className="td-ticket-h">1. Обстановка из билета</h4>
      <div className="td-form-grid">
        <label>
          Название
          <input required value={draft.title} onChange={(e) => field('title', e.target.value)} />
        </label>
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
        <label className="td-span-2">
          Что случилось
          <textarea
            required
            rows={5}
            placeholder="Как в PDF: возгорание, кто звонит, телефон, пострадавшие…"
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
        <label>
          Первая фраза заявителя
          <input
            value={draft.callerOpening ?? ''}
            placeholder="Помогите, у нас дым в подъезде"
            onChange={(e) => field('callerOpening', e.target.value)}
          />
        </label>
        <label>
          Классификатор
          <input
            value={draft.classifierNumber ?? ''}
            placeholder="например 1050101"
            onChange={(e) => field('classifierNumber', e.target.value)}
          />
        </label>
      </div>

      <h4 className="td-ticket-h">2. Службы — можно несколько</h4>
      <div className="td-class-cats">
        {SERVICE_OPTIONS.map((item) => (
          <label key={item.id}>
            <input type="checkbox" checked={services.includes(item.id)} onChange={() => toggleService(item.id)} />
            {item.label}
          </label>
        ))}
      </div>

      <aside className="td-ticket-preview" aria-label="Эталон для сверки">
        <p className="td-kicker">Эталон, с которым сверяется карточка</p>
        <dl>
          <div>
            <dt>Суть</dt>
            <dd>{preview.what || '—'}</dd>
          </div>
          <div>
            <dt>Адрес</dt>
            <dd>{preview.address || '—'}</dd>
          </div>
          <div>
            <dt>Заявитель</dt>
            <dd>{preview.callerFio || preview.callerRole || 'в билете нет ФИО'}</dd>
          </div>
          <div>
            <dt>Телефон</dt>
            <dd>{preview.phone || '—'}</dd>
          </div>
          <div>
            <dt>Службы</dt>
            <dd>{serviceLabels(preview.services) || '—'}</dd>
          </div>
        </dl>
      </aside>

      {scenario?.id ? (
        <>
          <h4 className="td-ticket-h">3. Проверка преподавателем</h4>
          <label>
            <input
              type="checkbox"
              checked={coach.approved}
              onChange={(e) => setCoach((current) => ({ ...current, approved: e.target.checked }))}
            />{' '}
            Эталон утверждён
          </label>
          <label>
            Указание заявителю на линии
            <textarea
              value={coach.note}
              placeholder="Коротко: не путать адрес, говорить тише…"
              onChange={(e) => setCoach((current) => ({ ...current, note: e.target.value }))}
            />
          </label>
        </>
      ) : null}

      <h4 className="td-ticket-h">4. Нормативы занятия</h4>
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
}: {
  scenarios: Scenario[];
  materials: TrainingMaterial[];
  onSave: (draft: ScenarioDraft) => Promise<void>;
}) {
  const [editing, setEditing] = useState<Scenario | 'new' | null>(null);
  const [query, setQuery] = useState('');
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
        <button className="td-btn td-btn--primary" onClick={() => setEditing('new')}>
          + Новый билет
        </button>
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
          <span>{visible.length} из {scenarios.length}</span>
        </div>
        <label className="td-ticket-search">
          Поиск
          <input
            value={query}
            placeholder="адрес, суть, служба…"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="td-card-list">
          {visible.map((scenario) => (
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
                {readCoachNote(scenario.id).approved ? <p>Эталон утверждён</p> : null}
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
                  Открыть конструктор
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
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
    </div>
  );
}
