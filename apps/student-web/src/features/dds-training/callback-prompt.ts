import type { TrainingScenario } from '../../data/scenarios';
import { promptCallerIdentity } from '../../data/caller-truth';
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
    'Диспетчер ДДС сам называет адрес и суть. Если не назвал — спроси только это.',
    'Если адрес и суть названы — подтверди, что заявка принята. Не обещай время прибытия и не говори, что наряд уже выехал, если этого нет в карточке.',
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
  const identity = promptCallerIdentity(scenario.situation ?? scenario.summary ?? '');
  return [
    ticketLabel,
    `ЧТО СЛУЧИЛОСЬ: ${facts.description || scenario.situation || scenario.summary}`,
    facts.address ? `АДРЕС (назови, только если спросили): ${facts.address}` : '',
    `КТО ЗВОНИТ: ${identity.who}`,
    identity.victim ? `ПОСТРАДАВШИЙ (это не ты): ${identity.victim}` : '',
    facts.callerPhone ? `ТЕЛЕФОН (назови, только если спросили): ${facts.callerPhone}` : '',
    `Пострадавшие: ${facts.injured}`,
    'Пропуск в строках — неизвестно: скажи «не знаю». Не заменяй пропуск на «нет» или ноль. Прямое «нет» в карточке — отдельный факт.',
    'Это обратный звонок диспетчера ДДС. Ты уже звонил в 112 и сейчас снял трубку. Не представляйся так, будто звонишь впервые.',
    'Если диспетчер спрашивает номер — назови ТЕЛЕФОН из строк выше. На вопрос о факте не отвечай пустым «хорошо». Его ошибка не меняет событие.',
  ]
    .filter(Boolean)
    .join('\n');
}
