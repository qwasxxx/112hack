import { SERVICE_LABEL, SCENARIOS, type TrainingScenario } from '../data/scenarios';

type Props = {
  onOpen: (scenario: TrainingScenario) => void;
};

export function CatalogPage(props: Props) {
  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">112</span>
          <div>
            <p className="brand-title">Обучение операторов</p>
            <p className="brand-sub">Система обеспечения вызова экстренных служб</p>
          </div>
        </div>
        <div className="operator">
          <span className="operator-role">Обучающийся</span>
          <span className="operator-name">Смирнова А. В.</span>
        </div>
      </header>

      <section className="panel">
        <div className="panel-head">
          <h1>Учебные сценарии</h1>
          <p>Выберите случай, прочитайте краткую теорию и выйдите на учебный вызов.</p>
        </div>
        <table className="grid">
          <thead>
            <tr>
              <th>Код</th>
              <th>Сценарий</th>
              <th>Службы</th>
              <th>Время</th>
              <th>Уровень</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {SCENARIOS.map((scenario) => (
              <tr key={scenario.id}>
                <td className="mono">{scenario.code}</td>
                <td>
                  <strong>{scenario.title}</strong>
                  <div className="row-sub">{scenario.summary}</div>
                </td>
                <td>{scenario.services.map((item) => SERVICE_LABEL[item]).join(', ')}</td>
                <td>{scenario.durationMin} мин</td>
                <td>{scenario.difficulty}</td>
                <td className="col-action">
                  <button type="button" className="btn btn-primary" onClick={() => props.onOpen(scenario)}>
                    Открыть
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
