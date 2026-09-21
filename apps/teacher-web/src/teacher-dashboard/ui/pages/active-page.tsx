import { useMemo, useState } from 'react';
import type { ActiveSession, TrainingGroup } from '../../domain/entities';
import { calculateRisk } from '../../application/services/risk-radar';
import { difficultyLabels, emotionLabels, formatDuration } from '../../domain/value-objects';
import { EmptyState, StatusBadge } from '../components/common';
import { TeacherFilterBar, TeacherFilterMenu, TeacherSearchField } from '../components/teacher-filter-menu';

export function ActivePage({
  sessions,
  groups,
  onObserve,
}: {
  sessions: ActiveSession[];
  groups: TrainingGroup[];
  onObserve: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [scenario, setScenario] = useState('');
  const [status, setStatus] = useState('');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const visible = useMemo(
    () =>
      [...sessions]
        .filter(
          (item) =>
            (!query ||
              `${item.student.name} ${item.scenarioTitle}`
                .toLowerCase()
                .includes(query.toLowerCase())) &&
            (!group || item.student.groupId === group) &&
            (!scenario || item.scenarioId === scenario) &&
            (!status || item.status === status),
        )
        .sort((a, b) => calculateRisk(b.riskSignals).score - calculateRisk(a.riskSignals).score),
    [sessions, query, group, scenario, status],
  );
  return (
    <div className="td-page">
      <header className="td-page-head">
        <div>
          <p className="td-kicker">Мониторинг</p>
          <h2>Активные занятия</h2>
        </div>
        <StatusBadge tone="good">{sessions.length} на линии</StatusBadge>
      </header>
      <TeacherFilterBar label="Фильтры активных занятий">
        <TeacherSearchField
          label="Поиск"
          value={query}
          placeholder="Имя или сценарий"
          onChange={setQuery}
        />
        <TeacherFilterMenu
          label="Группа"
          icon="people"
          value={group}
          open={openMenu === 'group'}
          onOpenChange={(open) => setOpenMenu(open ? 'group' : null)}
          onChange={setGroup}
          options={[
            { value: '', label: 'Все' },
            ...groups.map((item) => ({ value: item.id, label: item.name })),
          ]}
        />
        <TeacherFilterMenu
          label="Сценарий"
          icon="book"
          value={scenario}
          open={openMenu === 'scenario'}
          onOpenChange={(open) => setOpenMenu(open ? 'scenario' : null)}
          onChange={setScenario}
          options={[
            { value: '', label: 'Все' },
            ...[...new Map(sessions.map((item) => [item.scenarioId, item])).values()].map((item) => ({
              value: item.scenarioId,
              label: item.scenarioTitle,
            })),
          ]}
        />
        <TeacherFilterMenu
          label="Статус"
          icon="bars"
          value={status}
          open={openMenu === 'status'}
          onOpenChange={(open) => setOpenMenu(open ? 'status' : null)}
          onChange={setStatus}
          options={[
            { value: '', label: 'Все' },
            { value: 'live', label: 'В разговоре' },
            { value: 'paused', label: 'Пауза' },
            { value: 'finishing', label: 'Завершение' },
          ]}
        />
      </TeacherFilterBar>
      {sessions.length === 0 ? (
        <EmptyState>
          Нет активных занятий. Откройте билет во второй вкладке под учётом ученика — запись появится
          здесь сразу.
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState>По выбранным фильтрам сессий нет.</EmptyState>
      ) : (
        <div className="td-table-wrap">
          <table className="td-table">
            <thead>
              <tr>
                <th>Обучающийся</th>
                <th>Сценарий</th>
                <th>Режим</th>
                <th>Время</th>
                <th>Карточка</th>
                <th>Состояние</th>
                <th>Риск ↓</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => {
                const risk = calculateRisk(item.riskSignals);
                return (
                  <tr key={item.callId}>
                    <td>
                      <strong>{item.student.name}</strong>
                      <small>
                        {groups.find((entry) => entry.id === item.student.groupId)?.name}
                      </small>
                    </td>
                    <td>
                      <strong>{item.scenarioTitle}</strong>
                      <small>{difficultyLabels[item.difficulty]}</small>
                    </td>
                    <td>
                      <StatusBadge
                        tone={
                          item.category === 'Брифинг' || item.category === 'Теория'
                            ? 'neutral'
                            : item.mode === 'exam'
                              ? 'warning'
                              : 'neutral'
                        }
                      >
                        {item.category === 'Брифинг' || item.category === 'Теория'
                          ? item.category
                          : item.mode === 'exam'
                            ? 'Экзамен'
                            : item.category === 'ДДС'
                              ? 'ДДС'
                              : 'Тренировка'}
                      </StatusBadge>
                    </td>
                    <td>{formatDuration(item.durationSec)}</td>
                    <td>
                      <div className="td-progress">
                        <i style={{ width: `${item.cardProgress}%` }} />
                      </div>
                      <small>{item.cardProgress}%</small>
                    </td>
                    <td>{emotionLabels[item.emotionalState.primary]}</td>
                    <td>
                      <StatusBadge
                        tone={
                          risk.level === 'high'
                            ? 'danger'
                            : risk.level === 'medium'
                              ? 'warning'
                              : 'good'
                        }
                      >
                        {risk.score}
                      </StatusBadge>
                    </td>
                    <td>
                      <button
                        className="td-btn td-btn--secondary"
                        onClick={() => onObserve(item.callId)}
                      >
                        Наблюдать
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
