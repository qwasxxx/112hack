import type { TrainingScenario } from '../../data/scenarios';
import { promptCallerIdentity } from '../../data/caller-truth';
import type { ServiceKind } from '../../data/scenarios';
import type { TicketFacts } from './incoming-card';

const SERVICE_MARK: Record<ServiceKind, string[]> = {
  fire: ['101', 'пожар'],
  police: ['102', 'полиц'],
  ambulance: ['103', 'скор'],
  gas: ['104', 'газ'],
};

export function crewDepartureReady(card: {
  role: string;
  workplaceStatus: string;
  naryad: string;
  crewInbound?: string;
  facts: TicketFacts;
  contacts: { service: string }[];
}): boolean {
  if (card.role !== 'own' || card.crewInbound) {
    return false;
  }
  if (card.workplaceStatus !== 'Принята' || !card.naryad.trim()) {
    return false;
  }
  return card.contacts.some((item) => {
    const text = item.service.toLowerCase().replace(/ё/g, 'е');
    return card.facts.services.some((kind) => SERVICE_MARK[kind].some((mark) => text.includes(mark)));
  });
}

export function assignedCrewNumber(seed: string): string {
  let hash = 0;
  for (const char of seed) {
    hash = (hash + char.charCodeAt(0) * 17) % 70;
  }
  return String(21 + hash);
}

export function buildDdsServicePrompt(
  label: string,
  phone: string,
  cardNumber: string,
  facts: TicketFacts,
  naryad = assignedCrewNumber(cardNumber),
): string {
  return [
    `Служба: ${label}, номер ${phone}.`,
    `Карточка ${cardNumber}.`,
    facts.address ? `АДРЕС В КАРТОЧКЕ: ${facts.address}` : '',
    facts.description ? `СУТЬ: ${facts.description}` : '',
    `Пострадавшие в карточке: ${facts.injured}`,
    `НОМЕР НАРЯДА: ${naryad}. Это единственный номер. Другой не называй.`,
    'Адрес из карточки вслух не зачитывай и не спрашивай, правильно ли ты его прочитал. Адрес называет диспетчер.',
    'Пока диспетчер не назвал адрес — спроси только адрес. Заявку не подтверждай и номер наряда не говори.',
    'Если адрес есть, а направить наряд не просили — спроси, направлять ли наряд. Номер ещё не говори.',
    'Когда названы адрес и просьба направить наряд — подтверди заявку и назови этот номер наряда. Минуты прибытия не обещай.',
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
  lines.push('Ты уже на месте, работы ещё идут. Скажи это, чтобы диспетчер поставил статус. Новое событие не выдумывай.');
  lines.push('Ты не заявитель и не оператор 112.');
  return lines.filter(Boolean).join('\n');
}

export function ddsCrewOpening(facts?: TicketFacts, defects: Array<'service' | 'injured' | 'phone'> = []): string {
  if (facts && defects.includes('injured')) {
    const seen = facts.injured === 'Есть' ? 'пострадавшие есть' : 'пострадавших нет';
    return `Бригада на месте. В карточке пострадавшие указаны неверно: ${seen}. Работы идут.`;
  }
  if (facts && defects.includes('phone') && facts.callerPhone) {
    return `Бригада на месте. В карточке нет телефона. Телефон ${facts.callerPhone}. Работы идут.`;
  }
  return 'Бригада на месте. Всё как в карточке. Работы идут.';
}

export function crewEtaMinutes(seed: string): number {
  let hash = 0;
  for (const char of seed) {
    hash = (hash + char.charCodeAt(0)) % 8;
  }
  return 8 + hash;
}

export function ddsCrewInboundOpening(naryad: string, address: string, eta: number): string {
  const crew = naryad.trim() || 'без номера';
  const place = address.trim() || 'адрес из карточки';
  return `Диспетчер, наряд ${crew} выехал на ${place}. Будем примерно через ${eta} минут.`;
}

export function buildDdsCrewInboundPrompt(facts: TicketFacts, naryad: string, eta: number): string {
  return [
    'Этот звонок начал ты. Ты ещё не на месте, только выехал.',
    `НАРЯД: ${naryad.trim()}.`,
    facts.address ? `АДРЕС: ${facts.address}.` : 'АДРЕС в карточке не указан. Так и скажи, улицу не выдумывай.',
    facts.description ? `СУТЬ, уже известная по карточке: ${facts.description}.` : '',
    `Пострадавшие по карточке: ${facts.injured}. На этом звонке место ты не видел, ошибку карточки не обсуждай.`,
    `МИНУТЫ В ПУТИ: ${eta}. Другое число не называй.`,
    'Если диспетчер переспрашивает номер, адрес или срок — повтори только строки выше.',
    'Не говори, что уже прибыл. Не представляйся заявителем и не проси помощь.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildDdsChiefPrompt(facts: TicketFacts, naryad?: string): string {
  return [
    'РОЛЬ: вышестоящий начальник. Не заявитель и не пострадавший.',
    'Диспетчер ДДС докладывает по уже открытой карточке.',
    facts.address ? `АДРЕС: ${facts.address}` : '',
    naryad ? `НОМЕР НАРЯДА: ${naryad}.` : '',
    'Адрес, суть и номер вслух не подсказывай. Их называет диспетчер.',
    'Если в докладе нет номера наряда — спроси только: «Какой номер наряда?» Не говори, что доклад принят.',
    'Если номер есть, а адреса нет — спроси только: «Назовите адрес.»',
    'Когда названы адрес и номер наряда — скажи только: «Принял.»',
  ]
    .filter(Boolean)
    .join('\n');
}

export function ddsChiefOpening(): string {
  return 'Докладывайте.';
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
