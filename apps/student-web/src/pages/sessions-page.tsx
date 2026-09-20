import { historyRecommendations, lessonsNewestFirst, printLessonCertificate, progressStats, readLessons, type LessonRecord } from '../progress';
import './sessions-page.css';

const MODE_LABEL: Record<LessonRecord['mode'], string> = {
  training: 'Тренировка 112',
  exam: 'Экзамен',
  dds: 'ДДС',
};

function exportSessionsCsv(login: string, name: string) {
  const rows = readLessons(login);
  const header = ['Когда', 'Режим', 'Код', 'Билет', 'Балл', 'Зачёт', 'Карточка', 'Разговор', 'Сводка'];
  const lines = [
    header.join(';'),
    ...rows.map((item) =>
      [
        item.completedAt,
        MODE_LABEL[item.mode],
        item.scenarioCode,
        item.scenarioTitle.replace(/;/g, ','),
        String(item.score),
        item.passed ? 'да' : 'нет',
        item.cardScore ?? '',
        item.callScore ?? '',
        (item.summary || '').replace(/;/g, ','),
      ].join(';'),
    ),
  ];
  const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `sys112-sessions-${name.replace(/\s+/g, '-')}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function SessionsBoard(props: { login: string; name: string }) {
  const records = lessonsNewestFirst(props.login);
  const stats = progressStats(records);
  const recs = historyRecommendations(records);

  return (
    <section className="sessions-board" aria-labelledby="sessions-title">
      <header className="sessions-head">
        <div>
          <p className="sessions-kicker">Профиль · {props.name}</p>
          <h2 id="sessions-title">Мои сессии</h2>
          <p className="sessions-lead">
            Результаты пишутся автоматически после тренировки, экзамена и карточки ДДС. Удалить записи нельзя.
          </p>
        </div>
        <div className="sessions-head-tools">
          <dl className="sessions-stats">
            <div>
              <dt>Занятий</dt>
              <dd>{stats.total}</dd>
            </div>
            <div>
              <dt>Зачёт</dt>
              <dd>
                {stats.passed}
                {stats.total ? <span> / {stats.total}</span> : null}
              </dd>
            </div>
            <div>
              <dt>Средний балл</dt>
              <dd>{stats.total ? stats.avg : '—'}</dd>
            </div>
          </dl>
          {records.length > 0 ? (
            <button type="button" className="sessions-export" onClick={() => exportSessionsCsv(props.login, props.name)}>
              Скачать CSV
            </button>
          ) : null}
        </div>
      </header>

      <aside className="sessions-recs" aria-label="Рекомендации">
        <h3>Что подтянуть</h3>
        <ul>
          {recs.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </aside>

      {records.length === 0 ? (
        <p className="sessions-empty">
          Пока пусто. Откройте билет: тренировка, экзамен или ДДС — оценка появится здесь. Часть билетов приходит SMS.
        </p>
      ) : (
        <ul className="sessions-list">
          {records.map((item) => (
            <li key={item.id} className={item.passed ? 'is-pass' : 'is-fail'}>
              <div className="sessions-row-top">
                <b>{item.score}</b>
                <span className="sessions-mode">{MODE_LABEL[item.mode]}</span>
                <span className="sessions-code">{item.scenarioCode}</span>
                <strong>{item.scenarioTitle}</strong>
                <time dateTime={item.completedAt}>{formatWhen(item.completedAt)}</time>
              </div>
              <p className="sessions-summary">{item.summary}</p>
              {item.cardScore != null ? (
                <p className="sessions-summary">
                  Карточка {item.cardScore}/50 · опрос {item.interviewScore ?? '—'}/20 · скорость{' '}
                  {item.speedScore ?? '—'}/15 · вежливость {item.politenessScore ?? '—'}/15
                </p>
              ) : null}
              {item.findings.filter((finding) => finding.code !== 'ai-note').length > 0 ? (
                <ul className="sessions-findings">
                  {item.findings
                    .filter((finding) => finding.code !== 'ai-note')
                    .slice(0, 4)
                    .map((finding) => (
                    <li key={`${item.id}-${finding.code}-${finding.field}`}>
                      <span>{finding.severity === 'error' ? 'ошибка' : 'замечание'}</span>
                      {finding.field}: {finding.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="sessions-ok">Замечаний нет</p>
              )}
              {item.recommendations[0] ? <p className="sessions-hint">{item.recommendations[0]}</p> : null}
              {item.reactionSeconds != null ? (
                <p className="sessions-summary">Реакция на входящий: {item.reactionSeconds} с</p>
              ) : null}
              {item.passed ? (
                <button
                  type="button"
                  className="sessions-export"
                  onClick={() => printLessonCertificate(item, props.name)}
                >
                  Справка
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
