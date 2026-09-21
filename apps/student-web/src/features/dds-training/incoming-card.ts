import { SERVICE_LABEL, type ServiceKind, type TrainingScenario } from '../../data/scenarios';

export type TicketFacts = {
  callerName: string;
  callerPhone: string;
  address: string;
  description: string;
  injured: string;
  services: ServiceKind[];
};

export type DdsDraft = {
  callerName: string;
  callerPhone: string;
  address: string;
  description: string;
  injured: string;
  services: ServiceKind[];
};

export type DdsDefect = 'service' | 'injured' | 'phone';

const ALL_SERVICES: ServiceKind[] = ['fire', 'ambulance', 'police', 'gas'];

const FIO = /[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?(?:\s+[А-ЯЁ][а-яё]+){1,2}/g;
const PHONE =
  /(?:тел\.?\s*)?(?:\+?7|8)?[\s\-()]*9\d{2}[\s\-()]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}|\b9\d{9}\b|\b\d{10,11}\b/;
const DOB = /дата рождения\s+\d{2}\.\d{2}\.\d{4}|д\/р\s*\d{2}\.\d{2}\.\d{4}/i;

export function phoneDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/** Билеты АГС пишут стенограммой. В карточке 112 для ДДС — нормальный текст. */
export function expandTicketShorthand(text: string): string {
  return text
    .replace(/ч\s*\/\s*дом/gi, 'частный дом')
    .replace(/\bд\/р\b/gi, 'дата рождения')
    .replace(/\bА\/Д\b/g, 'АД')
    .replace(/\bб\/п\b/gi, 'без пострадавших')
    .replace(/\bб\/р\b/gi, 'без оружия')
    .replace(/головная(?!\s+бол)/gi, 'головная боль')
    .replace(/головные(?!\s+бол)/gi, 'головные боли')
    .replace(/03 не треб[а-я.]*/gi, 'скорая не требуется')
    .replace(/\s+,/g, ',')
    .replace(/\s+/g, ' ')
    .trim();
}

export function factsFromScenario(scenario: TrainingScenario): TicketFacts {
  const raw = `${scenario.situation ?? scenario.summary ?? ''}`.replace(/\u00a0/g, ' ');
  const expanded = expandTicketShorthand(raw);
  const phoneMatch = expanded.match(PHONE);
  const callerPhone = phoneMatch ? phoneMatch[0].trim() : '';
  const names = expanded.match(FIO) ?? [];
  const callerName = names.at(-1)?.trim() ?? '';
  const dob = expanded.match(DOB)?.[0]?.replace(/^д\/р\s*/i, 'дата рождения ') ?? '';
  let description = expanded;
  if (callerName) {
    description = description.replace(callerName, ' ');
  }
  if (callerPhone) {
    description = description.replace(PHONE, ' ');
  }
  if (dob) {
    description = description.replace(DOB, ' ');
  }
  description = description
    .replace(/вызывает себе/gi, 'заявитель вызывает помощь себе')
    .replace(/тел\.\s*/gi, ' ')
    .replace(/[,\s]+$/g, '')
    .replace(/^[,\s]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const name = dob && callerName ? `${callerName}, ${dob}` : callerName;
  return {
    callerName: name,
    callerPhone,
    address: expandTicketShorthand(scenario.address ?? ''),
    description: description || expanded,
    injured: injuredFrom(`${expanded} ${scenario.summary ?? ''}`),
    services: [...scenario.services],
  };
}

function injuredFrom(text: string): string {
  const t = text.toLowerCase();
  if (/пострадавших нет|без пострадавших|б\/п|скорая не требуется|03 не треб/.test(t) && !/травм|кров|ожог|нож|избит|головн|сознан/.test(t)) {
    return 'Нет';
  }
  if (
    /пострадав|травм|кров|ожог|без сознания|избит|нож|судорог|задыха|головн|вызывает себе|давление|а\/д|инсульт|рожает|топор|потеряла сознание|теряет сознание/.test(
      t,
    )
  ) {
    return 'Есть';
  }
  return 'Нет';
}

function uniqueServices(items: ServiceKind[]): ServiceKind[] {
  return ALL_SERVICES.filter((item) => items.includes(item));
}

export function incomingFromFacts(
  facts: TicketFacts,
  difficulty: TrainingScenario['difficulty'],
  seed: number,
): { draft: DdsDraft; defects: DdsDefect[] } {
  const defects: DdsDefect[] = [];
  const extras = ALL_SERVICES.filter((item) => !facts.services.includes(item));
  let services = [...facts.services];
  if (extras.length) {
    services.push(extras[seed % extras.length]);
    defects.push('service');
  }
  if (difficulty === 'сложный' && facts.services.length > 1) {
    const drop = facts.services[seed % facts.services.length];
    services = services.filter((item) => item !== drop);
  }
  services = uniqueServices(services);
  if (services.length === facts.services.length && services.every((item, index) => item === facts.services[index])) {
    if (extras.length) {
      services = uniqueServices([...services, extras[0]]);
      if (!defects.includes('service')) {
        defects.push('service');
      }
    }
  }

  let injured = facts.injured;
  if (difficulty !== 'базовый' && facts.injured === 'Есть') {
    injured = 'Нет';
    defects.push('injured');
  }

  let callerPhone = facts.callerPhone;
  if (difficulty === 'сложный' && facts.callerPhone) {
    callerPhone = '';
    defects.push('phone');
  }

  return {
    defects,
    draft: {
      callerName: facts.callerName,
      callerPhone,
      address: facts.address,
      description: facts.description,
      injured,
      services,
    },
  };
}

export function scoreDds(draft: DdsDraft, facts: TicketFacts): {
  servicesOk: boolean;
  injuredOk: boolean;
  phoneOk: boolean;
  extra: ServiceKind[];
  missing: ServiceKind[];
} {
  const selected = uniqueServices(draft.services);
  const expected = uniqueServices(facts.services);
  const extra = selected.filter((item) => !expected.includes(item));
  const missing = expected.filter((item) => !selected.includes(item));
  const phoneExpected = phoneDigits(facts.callerPhone);
  const phoneGot = phoneDigits(draft.callerPhone);
  return {
    servicesOk: extra.length === 0 && missing.length === 0,
    injuredOk: draft.injured.trim() === facts.injured,
    phoneOk: !phoneExpected || phoneGot === phoneExpected,
    extra,
    missing,
  };
}

export function serviceCaption(kind: ServiceKind): string {
  const code: Record<ServiceKind, string> = {
    fire: '101',
    police: '102',
    ambulance: '103',
    gas: '104',
  };
  return `${code[kind]} ${SERVICE_LABEL[kind]}`;
}
