import type { Arm112PracticalResult } from '../model/training-result';
import { fromPracticalResult } from '../model/learning-result';

type Props = {
  result: Arm112PracticalResult;
  onLeave: () => void;
};

export function TrainingResultPanel(props: Props) {
  const result = props.result;
  const learning = fromPracticalResult(result);
  return (
    <div className="arm112-result" role="dialog" aria-label="Результат тренировки">
      <div className="arm112-result-card">
        <h2>
          Результат · {result.scenarioCode} {result.scenarioTitle}
        </h2>
        <dl>
          <dt>Режим</dt>
          <dd>{learning.mode}</dd>
          <dt>Сценарий</dt>
          <dd>{learning.scenarioId}</dd>
          <dt>Время сессии</dt>
          <dd>{learning.elapsedSeconds} сек</dd>
          <dt>Реакция на звонок</dt>
          <dd>{result.reactionSeconds == null ? '—' : `${result.reactionSeconds} сек`}</dd>
          <dt>Таймер карточки</dt>
          <dd>
            {result.cardTimerSeconds} сек {result.cardTimerExceeded ? '(превышен)' : ''} / норматив набора {result.cardTimerLimitSec} сек,
            сценарий {result.normativeDurationMin} мин
          </dd>
          <dt>Типы / признаки</dt>
          <dd>
            {result.classifier.selectedTypes.join(', ') || '—'}
            {result.classifier.priznak1 ? ` · ${result.classifier.priznak1}` : ''}
            {result.classifier.priznak2.length ? ` · ${result.classifier.priznak2.join(', ')}` : ''}
          </dd>
          <dt>Классификатор (факт)</dt>
          <dd>
            {result.classifier.matched.length === 0
              ? 'нет совпадений Лист1'
              : result.classifier.matched
                  .slice(0, 4)
                  .map((item) => `${item.number} r${item.row} ${item.finalType ?? ''} ${item.mainService ?? ''}`)
                  .join('; ')}
          </dd>
          <dt>Ожидаемая запись</dt>
          <dd>
            {result.classifier.expected.number} r{result.classifier.expected.row} {result.classifier.expected.finalType}{' '}
            {result.classifier.expected.mainService}
          </dd>
          <dt>Службы</dt>
          <dd>{result.services.map((item) => item.name).join(', ') || '—'}</dd>
          <dt>Карточка</dt>
          <dd>
            {result.card.caller.familyNameAndGivenName || 'ФИО не указано'} · {result.card.caller.callerStatus ?? 'статус не выбран'} ·{' '}
            {result.card.address.searchLine} {result.card.address.street} {result.card.address.house}
          </dd>
          <dt>Действия</dt>
          <dd>{learning.actions.length} ({learning.actions.map((item) => item.type).join(', ')})</dd>
          <dt>Замечания</dt>
          <dd>
            {learning.validation.length === 0
              ? 'обязательные поля заполнены'
              : learning.validation.map((item) => `${item.field}: ${item.message}`).join('; ')}
          </dd>
        </dl>
        <button type="button" className="arm112-orange-fill" onClick={props.onLeave}>
          К уроку
        </button>
      </div>
    </div>
  );
}
