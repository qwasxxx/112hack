import type { ContourSettings, ServiceRecord } from '../data/admin';
import { formatWhen } from '../data/admin';

type Props = {
  services: ServiceRecord[];
  settings: ContourSettings;
  onToggleService: (id: ServiceRecord['id']) => void;
  onSettings: (next: ContourSettings) => void;
  onBackup: () => void;
};

export function ContourPage(props: Props) {
  function patch(partial: Partial<ContourSettings>) {
    props.onSettings({ ...props.settings, ...partial });
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head">
          <h1>Сервисы</h1>
          <p>Запуск и остановка компонентов учебного комплекса.</p>
        </div>
        {props.services.map((service) => (
          <div key={service.id} className="service-row">
            <div>
              <strong>{service.title}</strong>
              <div className="row-sub">{service.detail}</div>
            </div>
            <div className="call-meta">
              <span className={`badge ${service.running ? 'badge-ok' : 'badge-bad'}`}>
                {service.running ? 'Работает' : 'Остановлен'}
              </span>
              <button
                type="button"
                className={service.running ? 'btn btn-danger' : 'btn btn-primary'}
                onClick={() => props.onToggleService(service.id)}
              >
                {service.running ? 'Остановить' : 'Запустить'}
              </button>
            </div>
          </div>
        ))}
      </section>

      <section className="split">
        <article className="panel">
          <div className="panel-head">
            <h1>IP-телефония</h1>
            <p>Параметры виртуального SIP в локальном контуре.</p>
          </div>
          <form className="card-form" onSubmit={(event) => event.preventDefault()}>
            <label className="field">
              <span>Хост</span>
              <input
                value={props.settings.sipHost}
                onChange={(event) => patch({ sipHost: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Порт</span>
              <input
                value={props.settings.sipPort}
                onChange={(event) => patch({ sipPort: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Кодек</span>
              <select
                value={props.settings.codec}
                onChange={(event) => patch({ codec: event.target.value })}
              >
                <option>G.711</option>
                <option>G.722</option>
                <option>Opus</option>
              </select>
            </label>
            <label className="field">
              <span>Одновременные сессии</span>
              <input
                value={props.settings.maxSessions}
                onChange={(event) => patch({ maxSessions: event.target.value })}
              />
            </label>
          </form>
        </article>

        <article className="panel">
          <div className="panel-head">
            <h1>Резервное копирование и журналы</h1>
            <p>Снимок не реже раза в сутки. Журналы безопасности хранятся 6 месяцев.</p>
          </div>
          <form className="card-form" onSubmit={(event) => event.preventDefault()}>
            <label className="field">
              <span>Время ежедневной копии</span>
              <input
                type="time"
                value={props.settings.backupHour}
                onChange={(event) => patch({ backupHour: event.target.value })}
              />
            </label>
            <p className="meta">Последняя копия: {formatWhen(props.settings.lastBackupAt)}</p>
            <button type="button" className="btn btn-primary" onClick={props.onBackup}>
              Создать копию сейчас
            </button>
            <label className="field">
              <span>Уровень журналирования</span>
              <select
                value={props.settings.logLevel}
                onChange={(event) =>
                  patch({ logLevel: event.target.value as ContourSettings['logLevel'] })
                }
              >
                <option value="debug">debug</option>
                <option value="info">info</option>
                <option value="warn">warn</option>
              </select>
            </label>
            <label className="field">
              <span>Хранение журналов, дни</span>
              <input
                value={props.settings.logRetentionDays}
                onChange={(event) => patch({ logRetentionDays: event.target.value })}
              />
            </label>
          </form>
        </article>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h1>Безопасность</h1>
          <p>Базовые политики включены. Снять TLS или RBAC без отдельных прав нельзя.</p>
        </div>
        <div className="service-row">
          <div>
            <strong>TLS / SSL внутри контура</strong>
            <div className="row-sub">Шифрование каналов передачи данных</div>
          </div>
          <span className="badge badge-ok">Включено</span>
        </div>
        <div className="service-row">
          <div>
            <strong>RBAC</strong>
            <div className="row-sub">Разграничение доступа по ролям</div>
          </div>
          <span className="badge badge-ok">Включено</span>
        </div>
        <p className="notice" style={{ marginTop: 16 }}>
          Администратор не меняет оценки, сценарии и ход активного занятия. Персональные данные
          обучающихся доступны только в объёме, нужном для учёток.
        </p>
      </section>
    </div>
  );
}
