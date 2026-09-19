import { useState } from 'react';
import type { InterventionType, ScenarioDifficulty } from '@sys112/shared-types';
import type { Scenario, ScenarioDraft, TrainingMaterial } from '../../domain/entities';
import { difficultyLabels, formatDateTime } from '../../domain/value-objects';
import { StatusBadge } from '../components/common';

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
  category: 'Пожар',
  location: '',
  difficulty: 'standard',
  description: '',
  timeLimitSec: 30,
  requiredActions: [],
  allowedErrors: 1,
  passThreshold: 75,
  materials: [],
  allowedInterventions: ['set_emotional_state', 'add_circumstance'],
});

function ScenarioForm({
  scenario,
  onSave,
  onCancel,
}: {
  scenario?: Scenario;
  onSave: (draft: ScenarioDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<ScenarioDraft>(scenario ? { ...scenario } : emptyDraft());
  const [actions, setActions] = useState(scenario?.requiredActions.join('\n') ?? '');
  const [materials, setMaterials] = useState(scenario?.materials.join('\n') ?? '');
  const [saving, setSaving] = useState(false);
  const field = <K extends keyof ScenarioDraft>(key: K, value: ScenarioDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave({
        ...draft,
        requiredActions: actions
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean),
        materials: materials
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean),
      });
      onCancel();
    } finally {
      setSaving(false);
    }
  };
  return (
    <form className="td-panel td-form" onSubmit={(event) => void submit(event)}>
      <div className="td-section-title">
        <h3>{scenario ? 'Редактирование сценария' : 'Новый сценарий'}</h3>
        <button type="button" className="td-icon-btn" onClick={onCancel} aria-label="Закрыть форму">
          ×
        </button>
      </div>
      <div className="td-form-grid">
        <label>
          Название
          <input required value={draft.title} onChange={(e) => field('title', e.target.value)} />
        </label>
        <label>
          Тип происшествия
          <select value={draft.category} onChange={(e) => field('category', e.target.value)}>
            <option>Пожар</option>
            <option>Медицина</option>
            <option>ДТП</option>
            <option>Полиция</option>
            <option>Газовая служба</option>
          </select>
        </label>
        <label>
          Локация
          <input
            required
            value={draft.location}
            onChange={(e) => field('location', e.target.value)}
          />
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
          Описание
          <textarea
            required
            value={draft.description}
            onChange={(e) => field('description', e.target.value)}
          />
        </label>
        <label>
          Лимит времени, сек.
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
          Обязательные действия (по одному в строке)
          <textarea required value={actions} onChange={(e) => setActions(e.target.value)} />
        </label>
        <label className="td-span-2">
          Материалы (по одному в строке)
          <textarea value={materials} onChange={(e) => setMaterials(e.target.value)} />
        </label>
      </div>
      <fieldset>
        <legend>Разрешённые вмешательства</legend>
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
          {saving ? 'Сохранение…' : 'Сохранить mock-сценарий'}
        </button>
      </div>
    </form>
  );
}

export function ScenariosPage({
  scenarios,
  materials,
  onSave,
  onToggleArchive,
}: {
  scenarios: Scenario[];
  materials: TrainingMaterial[];
  onSave: (draft: ScenarioDraft) => Promise<void>;
  onToggleArchive: (id: string, archived: boolean) => Promise<void>;
}) {
  const [editing, setEditing] = useState<Scenario | 'new' | null>(null);
  return (
    <div className="td-page">
      <header className="td-page-head">
        <div>
          <p className="td-kicker">Учебный контент</p>
          <h2>Сценарии и материалы</h2>
        </div>
        <button className="td-btn td-btn--primary" onClick={() => setEditing('new')}>
          + Создать сценарий
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
          <h3>Сценарии</h3>
          <span>{scenarios.length} записей</span>
        </div>
        <div className="td-card-list">
          {scenarios.map((scenario) => (
            <article className="td-scenario-card" key={scenario.id}>
              <div>
                <div className="td-inline">
                  <StatusBadge
                    tone={
                      scenario.status === 'active'
                        ? 'good'
                        : scenario.status === 'archived'
                          ? 'neutral'
                          : 'warning'
                    }
                  >
                    {scenario.status === 'active'
                      ? 'Активен'
                      : scenario.status === 'archived'
                        ? 'Архив'
                        : 'Черновик'}
                  </StatusBadge>
                  <span>v{scenario.version}</span>
                </div>
                <h4>{scenario.title}</h4>
                <p>
                  {scenario.category} · {difficultyLabels[scenario.difficulty]} ·{' '}
                  {scenario.location}
                </p>
              </div>
              <dl>
                <div>
                  <dt>Назначений</dt>
                  <dd>{scenario.assignments}</dd>
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
                  Редактировать
                </button>
                <button
                  className="td-btn td-btn--ghost"
                  onClick={() => void onToggleArchive(scenario.id, scenario.status !== 'archived')}
                >
                  {scenario.status === 'archived' ? 'Восстановить' : 'Архивировать'}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="td-panel">
        <div className="td-section-title">
          <div>
            <h3>Учебные материалы</h3>
            <span className="td-help">Серверное хранение ещё не подключено</span>
          </div>
          <button
            className="td-btn td-btn--secondary"
            onClick={() =>
              window.alert(
                'Демонстрация: загрузка файлов появится после подключения серверного хранилища.',
              )
            }
          >
            Загрузить файл
          </button>
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
                  <td>
                    {scenarios.find((scenario) => scenario.id === item.scenarioId)?.title ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
