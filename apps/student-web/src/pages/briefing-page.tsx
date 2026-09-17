import type { ReactNode } from 'react';
import { LESSON_SECTIONS, SERVICE_LABEL, type LessonSection, type TrainingScenario } from '../data/scenarios';

type Props = {
  scenario: TrainingScenario;
  accountBar: ReactNode;
  onBack: () => void;
  onStart: (section: LessonSection) => void;
};

export function BriefingPage(props: Props) {
  return (
    <div className="page">
      <header className="topbar">
        <button type="button" className="link" onClick={props.onBack}>
          К списку сценариев
        </button>
        {props.accountBar}
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
          <h2>Перед занятием</h2>
          <ul className="bullets">
            {props.scenario.theory.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <aside className="panel">
          <h2>Разделы урока</h2>
          <div className="lesson-list">
            {LESSON_SECTIONS.map((section) => (
              <article key={section.id} className="lesson-card">
                <p className="kicker">{section.youAre}</p>
                <h2>{section.title}</h2>
                <p className="lead">{section.lead}</p>
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  disabled={!section.enabled}
                  onClick={() => props.onStart(section.id)}
                >
                  {section.enabled ? `Начать: ${section.title}` : 'Скоро'}
                </button>
              </article>
            ))}
          </div>
        </aside>
      </section>
    </div>
  );
}
