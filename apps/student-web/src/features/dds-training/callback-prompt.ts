import type { TrainingScenario } from '../../data/scenarios';
import type { TicketFacts } from './incoming-card';

export function buildDdsServicePrompt(
  label: string,
  phone: string,
  cardNumber: string,
  facts: TicketFacts,
): string {
  return [
    `Служба: ${label}, номер ${phone}.`,
    `Карточка ${cardNumber}.`,
    facts.address ? `АДРЕС В КАРТОЧКЕ: ${facts.address}` : '',
    facts.description ? `СУТЬ: ${facts.description}` : '',
    `Пострадавшие в карточке: ${facts.injured}`,
    'Диспетчер ДДС должен сам назвать адрес, суть и попросить наряд. Если не назвал — спроси. Если назвал — подтверди выезд.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function ddsServiceOpening(label: string): string {
  return `${label}, слушаю.`;
}

export function ddsCallbackOpening(): string {
  return 'Алло.';
}

export function buildDdsCallbackPrompt(scenario: TrainingScenario, facts: TicketFacts): string {
  const ticketLabel =
    scenario.ticketNo && scenario.situationNo
      ? `Билет ${scenario.ticketNo}, ситуация ${scenario.situationNo}`
      : scenario.code;
  return [
    ticketLabel,
    `ЧТО СЛУЧИЛОСЬ: ${facts.description || scenario.situation || scenario.summary}`,
    facts.address ? `АДРЕС (назови, только если спросили): ${facts.address}` : '',
    facts.callerName ? `КТО ЗВОНИТ: ${facts.callerName}` : '',
    facts.callerPhone ? `ТЕЛЕФОН (назови, только если спросили): ${facts.callerPhone}` : '',
    `Пострадавшие: ${facts.injured}`,
    'Чего нет в этих строках — не существует. Не додумывай улицы, этажи, имена, телефоны, службы и цифры.',
    'Это обратный звонок диспетчера ДДС, не первичный вызов 112. Ты заявитель, уже звонил в 112. Сейчас снимаешь трубку.',
    'Если диспетчер спрашивает номер или телефон — назови ТЕЛЕФОН из строк выше. Не отвечай «хорошо» на вопрос.',
  ]
    .filter(Boolean)
    .join('\n');
}
