import { SERVICE_LABEL, type TrainingScenario } from '../data/scenarios';

type Props = {
  scenario: TrainingScenario;
  onBack: () => void;
  onStart: () => void;
};

export function BriefingPage(props: Props) {
  return (
    <div className="page">
      <header className="topbar">
        <button type="button" className="link" onClick={props.onBack}>
          К списку сценариев
        </button>
        <div className="operator">
          <span className="operator-role">Обучающийся</span>
          <span className="operator-name">Смирнова А. В.</span>
        </div>
      </header>

      <section className="split">
        <article className="panel">
          <p className="kicker">{props.scenario.code}</p>
          <h1>{props.scenario.title}</h1>
          <p className="lead">{props.scenario.summary}</p>
          <p className="meta">
            {props.scenario.services.map((item) => SERVICE_LABEL[item]).join(' · ')} · около{' '}
            {props.scenario.durationMin} мин · {props.scenario.difficulty}
          </p>
          <h2>Перед вызовом</h2>
          <ul className="bullets">
            {props.scenario.theory.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <aside className="panel">
          <h2>Что нужно сделать</h2>
          <ol className="steps">
            {props.scenario.checklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
          <button type="button" className="btn btn-primary btn-block" onClick={props.onStart}>
            Начать учебный вызов
          </button>
        </aside>
      </section>
    </div>
  );
}
