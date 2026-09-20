import type { EvidencedQuestion, EvidencedQuestionnaire } from '../data/evidenced-questionnaires';
import { mergeClassName, useArmRegionProps } from '../guided/arm-region';
import type { QuestionnaireAnswer, ClassifierPath } from '../model/arm112-models';
import { displayTypeTitle } from '../data/questionnaire-lookup';

type TagLevel = 'priznak1' | 'priznak2' | 'priznak3' | 'extraTags';

type Props = {
  selectedTypes: string[];
  additionalQuery: string;
  hits: Array<{ label: string }>;
  items: Array<{ type: string; q: EvidencedQuestionnaire }>;
  answersByType: Record<string, QuestionnaireAnswer[]>;
  classifier: ClassifierPath;
  priznak1: string[];
  priznak2: string[];
  priznak3: string[];
  extra: string[];
  matchedCount: number;
  onAdditionalQuery: (value: string) => void;
  onSelectHit: (type: string) => void;
  onRemoveType: (type: string) => void;
  onToggle: (type: string, question: string, value: string, exclusive: boolean) => void;
  onFreeText: (type: string, question: string, value: string) => void;
  onSelectPriznak: (level: TagLevel, value: string) => void;
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
  const exclusive = q.control === 'yes-no' || q.control === 'yes-no-unknown';
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

function TagRow(props: { label: string; options: string[]; selected: string[]; onToggle: (value: string) => void }) {
  if (props.options.length === 0) {
    return null;
  }
  return (
    <div className="arm112-q-row">
      <span>{props.label}</span>
      <div className="arm112-chip-wrap">
        {props.options.map((option) => (
          <button
            key={option}
            type="button"
            className={`arm112-chip${props.selected.includes(option) ? ' is-on' : ''}`}
            onClick={() => props.onToggle(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

export function QuestionnairePanel(props: Props) {
  const selectedP2 = props.classifier.priznak2;
  const selectedP3 = props.classifier.priznak3;
  const region = useArmRegionProps('incident');
  return (
    <section
      aria-label="ДОБАВИТЬ ТИП ПРОИСШЕСТВИЯ"
      className={mergeClassName('arm112-what', region.className)}
      data-arm-region={region['data-arm-region']}
      onClick={region.onClick}
    >
      <div className="arm112-q-head">
        <span>добавить тип происшествия</span>
      </div>
      <label className="arm112-field" style={{ background: '#fff', padding: '6px 8px', marginBottom: 8 }}>
        <input
          className="arm112-underline"
          placeholder="добавить тип происшествия"
          value={props.additionalQuery}
          onChange={(event) => props.onAdditionalQuery(event.target.value)}
        />
      </label>
      {props.hits.length > 0 ? (
        <div className="arm112-search-hits" style={{ marginBottom: 8 }}>
          {props.hits.map((hit) => (
            <button key={hit.label} type="button" onClick={() => props.onSelectHit(hit.label)}>
              {hit.label}
            </button>
          ))}
        </div>
      ) : null}
      {props.items.map((item) => {
        const title = item.q.title || displayTypeTitle(item.type);
        return (
          <article key={item.type} className="arm112-q-card">
            <span className="arm112-type-chip">{title}</span>
            <header className="arm112-q-title">
              <span>{title}</span>
              <button type="button" onClick={() => props.onRemoveType(item.type)} aria-label="Удалить">
                ×
              </button>
            </header>
            {item.q.questions.map((question, index) => (
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
      {props.classifier.groupCode || props.priznak1.length > 0 ? (
        <article className="arm112-q-card" style={{ marginTop: 8 }}>
          <header className="arm112-q-title">
            <span>Признаки классификатора</span>
          </header>
          <TagRow
            label="112-Признак.1"
            options={props.priznak1}
            selected={props.classifier.priznak1 ? [props.classifier.priznak1] : []}
            onToggle={(value) => props.onSelectPriznak('priznak1', value)}
          />
          <TagRow label="112-Признак.2" options={props.priznak2} selected={selectedP2} onToggle={(value) => props.onSelectPriznak('priznak2', value)} />
          <TagRow label="112-Признак.3" options={props.priznak3} selected={selectedP3} onToggle={(value) => props.onSelectPriznak('priznak3', value)} />
          <TagRow
            label="Дополнительные признаки"
            options={props.extra}
            selected={props.classifier.extraTags}
            onToggle={(value) => props.onSelectPriznak('extraTags', value)}
          />
        </article>
      ) : null}
    </section>
  );
}
