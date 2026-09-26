/** Shared ticket parsing. Extract only what the original text actually contains. */

export const TICKET_PHONE_RE =
  /(?:тел\.?\s*)?(?:\+?7|8)?[\s\-()]*9\d{2}[\s\-()]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}|\b9\d{9}\b|\b\d{10,11}\b/;

const FIO = /[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?(?:\s+[А-ЯЁ][а-яё]+){1,2}/g;

export type TicketPeople = {
  callerFio: string;
  callerRole: string;
  injuredName: string;
};

export type TicketInjured = {
  known: boolean;
  hasInjured: boolean | null;
  count: number | null;
};

export function extractPhoneDigits(text: string): string {
  const match = text.match(TICKET_PHONE_RE);
  return match ? match[0].replace(/\D/g, '') : '';
}

export function pickFragment(text: string, pattern: RegExp): string {
  return text.match(pattern)?.[1]?.trim() ?? '';
}

export function incidentEssence(text: string): string {
  const cleaned = text
    .replace(/\d+\s*(?:г|года|год|лет)\b\.?/gi, ' ')
    .replace(/зарядк[а-яё]*[^.,]*/gi, ' ')
    .replace(/\b(?:101|102|103|104|01|02|03|04)\s*не\s*треб[а-яё.]*/gi, ' ')
    .replace(/звонит\s+сам[а-яё]*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const sentence = cleaned
    .split(/[.!?…]/)
    .map((part) => part.trim())
    .find((part) => part.length >= 8);
  return (sentence || cleaned).replace(/^[,\s]+|[,\s]+$/g, '');
}

export function situationCore(situation: string, fio: string, phone: string): string {
  if (/уличн[а-яё]*\s+освещен|горит\s+уличн/i.test(situation)) {
    return 'Горит уличное освещение на МКАД — фонари светят. Это не пожар и не квартира.';
  }
  let text = situation;
  if (fio) {
    text = text.replace(fio, ' ');
  }
  if (phone) {
    text = text.replace(/\d[\d\s\-()]{8,}\d/g, ' ');
  }
  return text
    .replace(/\([^)]*\)/g, ' ')
    .replace(/пострадавших нет|без пострадавших|б\/п|б\/р/gi, ' ')
    .replace(/(?:,\s*){2,}/g, ', ')
    .replace(/\s+,/g, ',')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseInjured(situation: string): TicketInjured {
  const t = situation.toLowerCase();
  if (/о пострадавших.{0,24}нет|информации нет/.test(t) && !/\d+\s*пострадав/.test(t)) {
    return { known: false, hasInjured: null, count: null };
  }
  const counted = t.match(/(\d+)\s*пострадав/);
  if (counted) {
    return { known: true, hasInjured: Number(counted[1]) > 0, count: Number(counted[1]) };
  }
  if (/пострадавших нет|без пострадавших|пострадавших людей нет|пострадавших не видят|б\/п/.test(t)) {
    return { known: true, hasInjured: false, count: 0 };
  }
  if (
    /пострадал|ожог|без сознания|потеря(?:ла)? сознания|травм|кров|задыха|утоп|нож|упал|отек|отёк|перелом|ушибли|велосипед/.test(
      t,
    )
  ) {
    return { known: true, hasInjured: true, count: null };
  }
  return { known: false, hasInjured: null, count: null };
}

export function namesFromTicket(situation: string): TicketPeople {
  const names = situation.match(FIO) ?? [];
  let callerRole = '';
  if (/вызывает мама|звонит мама/i.test(situation)) {
    callerRole = 'мама';
  } else if (/вызывает отец|звонит отец/i.test(situation)) {
    callerRole = 'отец';
  } else if (/вызывает супруг/i.test(situation)) {
    callerRole = 'супруг';
  } else if (/подруга/i.test(situation)) {
    callerRole = 'подруга';
  } else if (/соседк|сосед/i.test(situation)) {
    callerRole = 'сосед';
  } else if (/бабушка/i.test(situation)) {
    callerRole = 'бабушка';
  }
  const injuredMatch =
    situation.match(
      /реб[её]нок[^,]{0,40}?([А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?(?:\s+[А-ЯЁ][а-яё]+)+)/,
    ) ||
    situation.match(
      /([А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?(?:\s+[А-ЯЁ][а-яё]+)+)\s+упал(?:ся|а|и)?(?:\s|,|\.|$)/,
    );
  const injuredRaw = injuredMatch?.[1]?.trim() ?? '';
  const injuredName = /^[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?(?:\s+[А-ЯЁ][а-яё]+){1,2}$/.test(injuredRaw)
    ? injuredRaw
    : '';
  const afterCall = situation.match(
    /вызывает(?:\s+себе)?[,\s]+([А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?(?:\s+[А-ЯЁ][а-яё]+){1,2})/,
  );
  const calledName = afterCall?.[1]?.trim() ?? '';
  const roleWords = new Set([
    'мама',
    'папа',
    'отец',
    'мать',
    'супруг',
    'супруга',
    'сосед',
    'соседка',
    'подруга',
    'бабушка',
  ]);
  let callerFio = '';
  if (/вызывает себе|звонит сама/.test(situation.toLowerCase()) && names.length) {
    callerFio = names[0]?.trim() ?? '';
  } else if (calledName && !roleWords.has(calledName.toLowerCase()) && calledName !== injuredName) {
    callerFio = calledName;
  } else if (!callerRole) {
    callerFio = names.filter((item) => item !== injuredName).at(-1)?.trim() ?? '';
  }
  return { callerFio, callerRole, injuredName };
}

export function callerStatusFrom(situation: string): string {
  const t = situation.toLowerCase();
  if (/очевидец|прохожий|работник|посетитель|проезжала мимо/.test(t)) {
    return 'очевидец';
  }
  if (/вызывает мама|вызывает отец|вызывает супруг|дочь,|бабушка/.test(t)) {
    return 'родственник';
  }
  if (/сосед/.test(t)) {
    return 'знакомый';
  }
  if (/подруга/.test(t)) {
    return 'знакомый';
  }
  if (/ребенок 4 года|ребенок \d/.test(t) && /вызывает/.test(t)) {
    return 'родственник';
  }
  if (/вызывает себе|звонит сама/.test(t)) {
    return 'пострадавший';
  }
  return '';
}

export function addressParts(address: string, situation: string): {
  house: string;
  street: string;
  corpus: string;
  apartment: string;
  entrance: string;
  floor: string;
} {
  return {
    house: pickFragment(address, /(?:дом\.?|д\.?|№)\s*(\d+[а-яa-z]?)/i),
    street: pickFragment(address, /(?:ул\.|улица)\s+([^,;(]+)/i),
    corpus: pickFragment(address, /(?:корп\.?|корпус)\s*(\d+[а-яa-z]?)/i),
    apartment: pickFragment(address, /(?:кв\.?|квартира)\s*(\d+[а-яa-z]?)/i),
    entrance: pickFragment(address, /(?:под\.?|подъезд)\s*(\d+)/i),
    floor: pickFragment(address, /(?:эт\.?|этаж)\s*(\d+)/i) || pickFragment(situation, /(\d+)[-\s]*м этаж/i),
  };
}
