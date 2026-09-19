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

const PHONE_TAIL = /(?:\+?7[\s-]?)?(?:\d{3}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}|\d{10,11})\s*$/;
const FIO = /([А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+){1,3})\s*$/;

export function phoneDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function factsFromScenario(scenario: TrainingScenario): TicketFacts {
  const situation = scenario.situation ?? scenario.summary;
  const phoneMatch = situation.match(PHONE_TAIL);
  const callerPhone = phoneMatch ? phoneMatch[0].trim() : '';
  const beforePhone = (phoneMatch ? situation.slice(0, phoneMatch.index) : situation).replace(/[,\s]+$/g, '');
  const nameMatch = beforePhone.match(FIO);
  const callerName = nameMatch ? nameMatch[1].trim() : '';
  const description = (nameMatch ? beforePhone.slice(0, nameMatch.index) : beforePhone).replace(/[,\s]+$/g, '').trim();
  return {
    callerName,
    callerPhone,
    address: scenario.address ?? '',
    description: description || situation,
    injured: injuredFrom(`${situation} ${scenario.summary}`),
    services: [...scenario.services],
  };
}

function injuredFrom(text: string): string {
  const t = text.toLowerCase();
  if (/пострадавших нет|б\/п|03 не треб/.test(t) && !/травм|кров|ожог|нож|избит/.test(t)) {
    return 'Нет';
  }
  if (/пострадав|травм|кров|ожог|без сознания|избит|нож|судорог|задыха/.test(t)) {
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
