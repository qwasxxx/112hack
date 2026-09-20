import { useMemo, useState } from 'react';
import { AdminFilterMenu } from '../components/admin-filter-menu';
import type { AdminUser, AuditEntry, StudentProgress } from '../data/admin';
import { formatWhen } from '../data/admin';
import {
  buildTrainingAnalytics,
  type TrainingCategory,
  type TrainingWindow,
} from '../data/training-analytics';

type Props = {
  users: AdminUser[];
  progress: StudentProgress[];
  audit: AuditEntry[];
  dataSource?: 'live' | 'demo';
};

export function TrainingPage(props: Props) {
  const [category, setCategory] = useState<TrainingCategory>('all');
  const [windowFilter, setWindowFilter] = useState<TrainingWindow>('all');
  const [open, setOpen] = useState<'category' | 'window' | null>(null);
  const stats = useMemo(
    () => buildTrainingAnalytics(props.users, props.progress, props.audit, { category, window: windowFilter }),
    [category, props.audit, props.progress, props.users, windowFilter],
  );

  return (
    <div className="ad-page">
      <header className="ad-page-head">
        <div>
          <p className="ad-kicker">Системная статистика обучения</p>
          <h1>Обучение</h1>
          <p className="ad-lead">
            Сводка использования учебного комплекса. Оценки, ход занятия и правки сценариев отсюда недоступны.
          </p>
        </div>
        <div className="ad-health-flag">
          <span className="ad-health-pulse" aria-hidden="true" />
          <div>
            <strong>Только просмотр</strong>
            <small>без вмешательства в активные занятия</small>
          </div>
        </div>
      </header>

      <aside className="ad-readonly-banner" role="note">
        <strong>Контур администратора</strong>
        <span>
          Агрегаты по обучающимся, сессиям и сценариям. Баллы преподавателя и текущая сессия здесь не
          редактируются.
        </span>
      </aside>

      <section className="ad-audit-toolbar ad-train-toolbar" aria-label="Фильтры обучения">
        <AdminFilterMenu
          label="Категория"
          value={category}
          options={[
            { value: 'all', label: 'Все категории' },
            { value: 'Пожар', label: 'Пожар' },
            { value: 'ДТП', label: 'ДТП' },
            { value: 'Поиск', label: 'Поиск' },
            { value: 'Прочее', label: 'Прочее' },
          ]}
          open={open === 'category'}
          onOpenChange={(next) => setOpen(next ? 'category' : null)}
          onChange={(value) => setCategory(value as TrainingCategory)}
        />
        <AdminFilterMenu
          label="Период"
          value={windowFilter}
          options={[
            { value: 'all', label: 'Всё время' },
            { value: '7d', label: '7 дней' },
            { value: '30d', label: '30 дней' },
          ]}
          open={open === 'window'}
          onOpenChange={(next) => setOpen(next ? 'window' : null)}
          onChange={(value) => setWindowFilter(value as TrainingWindow)}
        />
      </section>

      <section className="ad-surface" aria-label="Сводка обучения">
        <div className="ad-surface-head">
          <div>
            <p className="ad-kicker">Агрегаты</p>
            <h2>Использование комплекса</h2>
          </div>
          <span className="ad-help">
            {props.dataSource === 'demo'
              ? 'демо-срез · нет сохранённых сессий'
              : `локальные сессии · каталог ${stats.catalogSize} сценариев`}
          </span>
        </div>
        <div className="ad-metrics ad-health-grid">
          <article className="ad-metric ad-health-mod">
            <span>Обучающиеся</span>
            <strong>{stats.studentCount}</strong>
            <small>{stats.activeStudents} активных учёток</small>
          </article>
          <article className="ad-metric ad-health-mod">
            <span>Сессии</span>
            <strong>{stats.sessions}</strong>
            <small>завершённые попытки сценариев</small>
          </article>
          <article className="ad-metric ad-health-mod">
            <span>Активные занятия</span>
            <strong>{stats.activeTraining}</strong>
            <small>незавершённые за 7 дней</small>
          </article>
          <article className="ad-metric ad-health-mod">
            <span>Завершение</span>
            <strong>{stats.completion}%</strong>
            <small>
              {stats.lessonsDone} из {stats.lessonsTotal} модулей
            </small>
          </article>
          <article className="ad-metric ad-health-mod ad-metric--accent">
            <span>Средний результат</span>
            <strong>{stats.avgScore}%</strong>
            <small>по последним сессиям</small>
          </article>
        </div>
      </section>

      <div className="ad-split">
        <section className="ad-surface" aria-label="Динамика среднего балла">
          <div className="ad-surface-head">
            <div>
              <p className="ad-kicker">Динамика</p>
              <h2>Средний результат</h2>
            </div>
            <span className="ad-help">{stats.avgScore}%</span>
          </div>
          <Sparkline values={stats.scoreTrend} label="Динамика среднего балла" />
        </section>
        <section className="ad-surface" aria-label="Результаты по категориям">
          <div className="ad-surface-head">
            <div>
              <p className="ad-kicker">Категории</p>
              <h2>Результаты по типам</h2>
            </div>
          </div>
          <div className="ad-bars">
            {stats.categories.map((item) => (
              <article key={item.category} className="ad-bar-row">
                <span>{item.category}</span>
                <div className="meter" aria-label={`${item.category} ${item.score}%`}>
                  <span style={{ width: `${item.score}%` }} />
                </div>
                <strong>{item.score}%</strong>
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className="ad-split">
        <section className="ad-surface" aria-label="Распределение прогресса">
          <div className="ad-surface-head">
            <div>
              <p className="ad-kicker">Прогресс</p>
              <h2>Распределение завершения</h2>
            </div>
          </div>
          <div className="ad-dist-grid">
            {stats.distribution.map((item) => (
              <article key={item.label} className="ad-train-card">
                <span>{item.label}</span>
                <strong>{item.count}</strong>
                <small>{item.percent}% обучающихся</small>
              </article>
            ))}
          </div>
        </section>
        <section className="ad-surface" aria-label="Сводка категорий">
          <div className="ad-surface-head">
            <div>
              <p className="ad-kicker">Нагрузка</p>
              <h2>Категории и ошибки</h2>
            </div>
          </div>
          <div className="ad-heat-grid">
            {stats.weakAreas.length === 0 ? (
              <p className="ad-lead">Пока нет попыток по выбранным условиям.</p>
            ) : (
              stats.weakAreas.map((item) => (
                <article key={item.label} className="ad-train-card">
                  <strong>{item.count}</strong>
                  <span>{item.label}</span>
                </article>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="ad-surface" aria-label="Использование сценариев">
        <div className="ad-surface-head">
          <div>
            <p className="ad-kicker">Сценарии</p>
            <h2>Нагрузка по учебным карточкам</h2>
          </div>
          <span className="ad-help">Только факт прохождения, без правок оценки</span>
        </div>
        <div className="ad-scenario-grid">
          {stats.scenarios.length === 0 ? (
            <p className="ad-lead">Нет данных по сценариям в выбранном срезе.</p>
          ) : (
            stats.scenarios.map((item) => (
              <article key={item.code} className="ad-train-card">
                <span className="mono">{item.code}</span>
                <strong>{item.title}</strong>
                <div className="meter" aria-label={`Использование ${item.usage}%`}>
                  <span style={{ width: `${item.usage}%` }} />
                </div>
                <small>
                  {item.attempts} сессий · среднее {item.avg}% · {item.category}
                </small>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="ad-surface" aria-label="Последняя активность">
        <div className="ad-surface-head">
          <div>
            <p className="ad-kicker">Активность</p>
            <h2>Последние занятия</h2>
          </div>
          <span className="ad-help">Из локального прогресса и журнала</span>
        </div>
        <div className="ad-event-list">
          {stats.recent.length === 0 ? (
            <p className="ad-lead">Нет завершённых сессий в выбранном периоде.</p>
          ) : (
            stats.recent.map((item) => (
              <article key={item.id} className="ad-event">
                <time className="mono" dateTime={item.at}>
                  {formatWhen(item.at)}
                </time>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="ad-surface" aria-label="Обучающиеся контура">
        <div className="ad-surface-head">
          <div>
            <p className="ad-kicker">Контингент</p>
            <h2>Обучающиеся контура</h2>
          </div>
          <span className="ad-help">Карточки мониторинга, без кнопок оценки</span>
        </div>
        <div className="ad-train-list">
          {stats.rows.map((row) => (
            <article key={row.userId} className="ad-train-card ad-train-person">
              <div>
                <strong>{row.name}</strong>
                <span className="mono">{row.login}</span>
              </div>
              <span className={`ad-pill is-${row.status === 'active' ? 'ok' : 'bad'}`}>
                {row.status === 'active' ? 'Активна' : 'Блок'}
              </span>
              <div className="ad-train-progress">
                <span>
                  Пройдено {row.lessonsDone}/{row.lessonsTotal}
                </span>
                <div className="meter" aria-label={`Прогресс ${row.overall}%`}>
                  <span style={{ width: `${row.overall}%` }} />
                </div>
              </div>
              <small>
                Последний результат {row.lastScore}% · {formatWhen(row.lastAt)}
              </small>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Sparkline(props: { values: number[]; label: string }) {
  const width = 240;
  const height = 64;
  const max = Math.max(...props.values, 1);
  const min = Math.min(...props.values, 0);
  const span = Math.max(1, max - min);
  const points = props.values
    .map((value, index) => {
      const x = (index / Math.max(1, props.values.length - 1)) * width;
      const y = height - ((value - min) / span) * (height - 12) - 6;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg className="ad-sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={props.label}>
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
