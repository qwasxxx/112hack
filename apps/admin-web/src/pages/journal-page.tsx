import type { AuditEntry } from '../data/admin';
import { formatWhen } from '../data/admin';

type Props = {
  audit: AuditEntry[];
};

export function JournalPage(props: Props) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h1>Журнал аудита</h1>
        <p>Действия пользователей, ошибки контура и резервные копии.</p>
      </div>
      <table className="grid">
        <thead>
          <tr>
            <th>Время</th>
            <th>Кто</th>
            <th>Действие</th>
            <th>Объект</th>
          </tr>
        </thead>
        <tbody>
          {props.audit.map((entry) => (
            <tr key={entry.id}>
              <td className="mono">{formatWhen(entry.at)}</td>
              <td>{entry.actor}</td>
              <td>
                <strong>{entry.action}</strong>
              </td>
              <td className="row-sub">{entry.target}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
