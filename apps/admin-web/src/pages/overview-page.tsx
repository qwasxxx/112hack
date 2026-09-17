import type { AdminUser, AuditEntry, ServiceRecord, StudentProgress } from '../data/admin';
import { formatWhen } from '../data/admin';

type Props = {
  users: AdminUser[];
  services: ServiceRecord[];
  progress: StudentProgress[];
  audit: AuditEntry[];
  apiStatus: 'ok' | 'bad' | 'pending';
};

export function OverviewPage(props: Props) {
  const active = props.users.filter((user) => user.status === 'active').length;
  const students = props.users.filter((user) => user.role === 'STUDENT').length;
  const running = props.services.filter((item) => item.running).length;
  const avg =
    props.progress.length === 0
      ? 0
      : Math.round(
          props.progress.reduce((sum, item) => sum + item.lastScore, 0) / props.progress.length,
        );

  return (
    <div className="stack">
      <section className="stats">
        <article className="panel stat">
          <span>Активные учётки</span>
          <strong>{active}</strong>
        </article>
        <article className="panel stat">
          <span>Обучающиеся</span>
          <strong>{students}</strong>
        </article>
        <article className="panel stat">
          <span>Сервисы в работе</span>
          <strong>
            {running}/{props.services.length}
          </strong>
        </article>
        <article className="panel stat">
          <span>Средний балл группы</span>
          <strong>{avg}%</strong>
        </article>
      </section>

      <section className="split">
        <article className="panel">
          <div className="panel-head">
            <h1>Состояние контура</h1>
            <p>Контроль компонентов локального учебного комплекса в реальном времени.</p>
          </div>
          <p className="meta">
            API:{' '}
            {props.apiStatus === 'ok' ? 'доступен' : props.apiStatus === 'pending' ? 'проверка…' : 'нет ответа'}
          </p>
          {props.services.map((service) => (
            <div key={service.id} className="service-row">
              <div>
                <strong>{service.title}</strong>
                <div className="row-sub">{service.detail}</div>
              </div>
              <span className={`badge ${service.running ? 'badge-ok' : 'badge-bad'}`}>
                {service.running ? 'Работает' : 'Остановлен'}
              </span>
            </div>
          ))}
        </article>

        <article className="panel">
          <div className="panel-head">
            <h1>Последние события</h1>
            <p>Журнал действий и сбоев. Оценки занятий отсюда не меняются.</p>
          </div>
          <table className="grid">
            <thead>
              <tr>
                <th>Время</th>
                <th>Событие</th>
              </tr>
            </thead>
            <tbody>
              {props.audit.slice(0, 5).map((entry) => (
                <tr key={entry.id}>
                  <td className="mono">{formatWhen(entry.at)}</td>
                  <td>
                    <strong>{entry.action}</strong>
                    <div className="row-sub">{entry.target}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </section>
    </div>
  );
}
