import type { TheoryStep } from './types';
import './theory-guide-panel.css';

type Props = {
  steps: TheoryStep[];
  activeIndex: number;
  collapsed: boolean;
  onToggle: () => void;
  onSelect: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
};

export function TheoryGuidePanel(props: Props) {
  const step = props.steps[props.activeIndex];
  const last = props.activeIndex >= props.steps.length - 1;

  return (
    <aside className={`theory-guide${props.collapsed ? ' is-collapsed' : ''}`} aria-label="Обучение АРМ-112">
      <header className="theory-guide-head">
        <p className="theory-guide-kicker">Теория</p>
        <h1>АРМ-112</h1>
        <p>Назначение полей карточки и действия оператора.</p>
        <button type="button" className="theory-guide-toggle" onClick={props.onToggle}>
          {props.collapsed ? 'Панель' : 'Свернуть'}
        </button>
      </header>

      <nav className="theory-guide-steps" aria-label="Шаги">
        {props.steps.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={`theory-guide-step${index === props.activeIndex ? ' is-active' : ''}`}
            onClick={() => props.onSelect(index)}
          >
            <b>{item.index}</b>
            <span>{item.title}</span>
          </button>
        ))}
      </nav>

      {step ? (
        <div className="theory-guide-lesson">
          <p className="theory-guide-index">
            Шаг {step.index} из {props.steps.length}
          </p>
          <h2>{step.title}</h2>
          <section className="theory-guide-block">
            <span>Поле</span>
            <p>{step.fieldName}</p>
          </section>
          <section className="theory-guide-block">
            <span>Зачем</span>
            <p>{step.purpose}</p>
          </section>
          <section className="theory-guide-block">
            <span>Что делает оператор</span>
            <p>{step.operatorDoes}</p>
          </section>
          {step.note ? (
            <section className="theory-guide-block">
              <span>Важно</span>
              <p>{step.note}</p>
              {step.hotkey ? <span className="theory-guide-hotkey">{step.hotkey}</span> : null}
            </section>
          ) : null}
        </div>
      ) : null}

      <div className="theory-guide-nav">
        <button type="button" onClick={props.onPrev} disabled={props.activeIndex === 0}>
          Назад
        </button>
        <button type="button" className="is-next" onClick={props.onNext} disabled={last}>
          {last ? 'Готово' : 'Далее'}
        </button>
      </div>
    </aside>
  );
}
