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

export function buildDdsCrewPrompt(facts: TicketFacts, defects: Array<'service' | 'injured' | 'phone'>): string {
  const lines = [
    'РОЛЬ: руководитель бригады на месте. Не заявитель и не пострадавший.',
    facts.address ? `Адрес уже известен: ${facts.address}` : '',
    facts.description ? `Суть уже известна: ${facts.description}` : '',
  ];
  if (defects.includes('injured')) {
    lines.push(
      facts.injured === 'Есть'
        ? 'В карточке пострадавшие указаны неверно. На месте пострадавшие есть. Скажи это сразу.'
        : 'В карточке пострадавшие указаны неверно. На месте пострадавших нет. Скажи это сразу.',
    );
  }
  if (defects.includes('phone') && facts.callerPhone) {
    lines.push(`В карточке нет телефона. Телефон для связи: ${facts.callerPhone}. Назови его.`);
  }
  if (!defects.includes('injured') && !defects.includes('phone')) {
    lines.push('Коротко доложи, что на месте всё как в карточке. Новых пострадавших не выдумывай.');
  }
  lines.push('Ты не заявитель и не оператор 112.');
  return lines.filter(Boolean).join('\n');
}

export function ddsCrewOpening(): string {
  return 'Бригада на месте, слушаю.';
}

export function buildDdsChiefPrompt(facts: TicketFacts): string {
  return [
    'РОЛЬ: вышестоящий начальник. Не заявитель и не пострадавший.',
    'Диспетчер ДДС докладывает по уже открытой карточке.',
    facts.address ? `Адрес в карточке: ${facts.address}` : '',
    'Подтверди, что доклад принят. Адрес и число пострадавших не меняй и не выдумывай.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function ddsChiefOpening(): string {
  return 'Слушаю доклад.';
}

export function buildDdsReport112Prompt(facts: TicketFacts, draft: { injured: string; callerPhone: string }): string {
  const gaps: string[] = [];
  if (draft.injured.trim() !== facts.injured.trim()) {
    gaps.push(`пострадавшие в карточке «${draft.injured || 'пусто'}», по бригаде «${facts.injured}»`);
  }
  if (facts.callerPhone && !draft.callerPhone.trim()) {
    gaps.push(`телефона в карточке нет, бригада назвала ${facts.callerPhone}`);
  }
  return [
    'РОЛЬ: оператор 112. Карточка уже принята и передана в ДДС. Это не новый звонок заявителя.',
    gaps.length ? `Расхождение: ${gaps.join('; ')}.` : 'Если расхождения нет, подтверди карточку без правок.',
    'Прими сообщение и скажи, что карточку поправит 112. Не проси диспетчера ДДС переписывать чужие поля.',
  ].join('\n');
}

export function ddsReport112Opening(): string {
  return 'Служба 112, слушаю.';
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
