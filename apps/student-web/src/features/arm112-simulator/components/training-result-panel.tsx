import type { Arm112PracticalResult } from '../model/training-result';
import type { LessonRecord } from '../../../progress';

type Props = {
  result: Arm112PracticalResult;
  record: LessonRecord;
  onLeave: () => void;
};

export function TrainingResultPanel(props: Props) {
  const result = props.result;
  const record = props.record;
  return (
    <div className="arm112-result" role="dialog" aria-label="Результат тренировки">
      <div className="arm112-result-card">
        <h2>
          {record.passed ? 'Зачёт' : 'Незачёт'} · {record.score} · {result.scenarioCode} {result.scenarioTitle}
        </h2>
        <p className="arm112-result-saved">Результат записан в «Мои сессии». Удалить его нельзя.</p>
        <dl>
          <dt>Балл / порог</dt>
          <dd>
            {record.score} из 100 · зачёт от 70, если заполнены обязательные поля и службы эталона
          </dd>
          <dt>Реакция на звонок</dt>
          <dd>{result.reactionSeconds == null ? '—' : `${result.reactionSeconds} сек`}</dd>
          <dt>Таймер карточки</dt>
          <dd>
            {result.cardTimerSeconds} сек {result.cardTimerExceeded ? '(превышен)' : ''} / норматив {result.cardTimerLimitSec} сек
          </dd>
          <dt>Классификатор</dt>
          <dd>
            факт:{' '}
            {result.classifier.matched.length === 0
              ? 'нет совпадений'
              : result.classifier.matched
                  .slice(0, 3)
                  .map((item) => item.number)
                  .join(', ')}
            {' · эталон '}
            {result.classifier.expected.number} {result.classifier.expected.finalType}
          </dd>
          <dt>Службы</dt>
          <dd>{result.services.map((item) => item.name).join(', ') || '—'}</dd>
          <dt>Замечания</dt>
          <dd>
            {record.findings.length === 0
              ? 'нет'
              : record.findings.map((item) => `${item.field}: ${item.message}`).join('; ')}
          </dd>
          <dt>Рекомендации</dt>
          <dd>{record.recommendations.join(' ') || '—'}</dd>
        </dl>
        <button type="button" className="arm112-orange-fill" onClick={props.onLeave}>
          К уроку
        </button>
      </div>
    </div>
  );
}
