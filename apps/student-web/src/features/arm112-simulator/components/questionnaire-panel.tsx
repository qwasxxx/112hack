import {
  isExclusiveQuestion,
  visibleQuestions,
  type EvidencedQuestion,
  type EvidencedQuestionnaire,
} from '../data/evidenced-questionnaires';
import { mergeClassName, useArmRegionProps } from '../guided/arm-region';
import type { QuestionnaireAnswer } from '../model/arm112-models';
import { displayTypeTitle } from '../data/questionnaire-lookup';

type Props = {
  selectedTypes: string[];
  additionalQuery: string;
  catalog: readonly string[];
  items: Array<{ type: string; q: EvidencedQuestionnaire }>;
  answersByType: Record<string, QuestionnaireAnswer[]>;
  onAdditionalQuery: (value: string) => void;
  onSelectHit: (type: string) => void;
  onRemoveType: (type: string) => void;
  onToggle: (type: string, question: string, value: string, exclusive: boolean) => void;
  onFreeText: (type: string, question: string, value: string) => void;
};

function selectedValues(answers: QuestionnaireAnswer[] | undefined, question: string): string[] {
  return answers?.find((item) => item.questionLabel === question)?.values ?? [];
}

function QuestionRow(props: {
  question: EvidencedQuestion;
  values: string[];
  onToggle: (value: string, exclusive: boolean) => void;
  onFreeText: (value: string) => void;
}) {
  const q = props.question;
  if (q.control === 'text' || q.control === 'free-text-line') {
    return (
      <div className="arm112-q-row">
        <span>{q.label}</span>
        <input className="arm112-underline" value={props.values[0] ?? ''} onChange={(event) => props.onFreeText(event.target.value)} />
      </div>
    );
  }
  const exclusive = isExclusiveQuestion(q);
  return (
    <div className="arm112-q-row">
      <span>{q.label}</span>
      <div className="arm112-chip-wrap">
        {(q.options ?? []).map((option) => (
          <button
            key={option.label}
            type="button"
            className={`arm112-chip${props.values.includes(option.label) ? ' is-on' : ''}`}
            onClick={() => props.onToggle(option.label, exclusive)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function QuestionnairePanel(props: Props) {
  const region = useArmRegionProps('incident');
  const q = props.additionalQuery.trim().toLowerCase();
  const hits = q
    ? props.catalog.filter(
        (item) => item.toLowerCase().includes(q) && !props.selectedTypes.includes(item),
      )
    : [];
  return (
    <section
      aria-label="ДОБАВИТЬ ТИП ПРОИСШЕСТВИЯ"
      className={mergeClassName('arm112-what', region.className)}
      data-arm-region={region['data-arm-region']}
      onClick={region.onClick}
    >
      <div className="arm112-q-head">
        <span>добавить тип происшествия</span>
        <div className="arm112-chip-wrap">
          {props.selectedTypes.map((type) => (
            <span key={type} className="arm112-type-chip">
              {displayTypeTitle(type)}
            </span>
          ))}
        </div>
      </div>
      <label className="arm112-field" style={{ background: '#fff', padding: '6px 8px', marginBottom: 8 }}>
        <input
          className="arm112-underline"
          placeholder="добавить тип происшествия"
          value={props.additionalQuery}
          onChange={(event) => props.onAdditionalQuery(event.target.value)}
        />
      </label>
      {hits.length > 0 ? (
        <div className="arm112-search-hits" style={{ marginBottom: 8 }}>
          {hits.map((item) => (
            <button key={item} type="button" onClick={() => props.onSelectHit(item)}>
              {item}
            </button>
          ))}
        </div>
      ) : null}
      {props.items.map((item) => {
        const title = item.q.title || displayTypeTitle(item.type);
        const questions = visibleQuestions(item.q, props.answersByType[item.type]);
        return (
          <article key={item.type} className="arm112-q-card">
            <header className="arm112-q-title">
              <span>{title}</span>
              <button type="button" onClick={() => props.onRemoveType(item.type)} aria-label="Удалить">
                ×
              </button>
            </header>
            {questions.map((question, index) => (
              <QuestionRow
                key={`${item.type}-${question.label}-${index}`}
                question={question}
                values={selectedValues(props.answersByType[item.type], question.label)}
                onToggle={(value, exclusive) => props.onToggle(item.type, question.label, value, exclusive)}
                onFreeText={(value) => props.onFreeText(item.type, question.label, value)}
              />
            ))}
          </article>
        );
      })}
      {props.selectedTypes
        .filter((type) => !props.items.some((item) => item.type === type))
        .map((type) => (
          <article key={type} className="arm112-q-card" style={{ marginTop: 8 }}>
            <header className="arm112-q-title">
              <span>{displayTypeTitle(type)}</span>
              <button type="button" onClick={() => props.onRemoveType(type)}>
                ×
              </button>
            </header>
          </article>
        ))}
    </section>
  );
}
