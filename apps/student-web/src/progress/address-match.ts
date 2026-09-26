import type { IncidentAddress } from '../features/arm112-simulator/model/arm112-models';

const STOP = new Set([
  'г',
  'гор',
  'город',
  'ул',
  'улица',
  'д',
  'дер',
  'дом',
  'обл',
  'область',
  'рн',
  'район',
  'пос',
  'поселок',
  'посёлок',
  'поселка',
  'стр',
  'строение',
  'корп',
  'корпус',
  'москва',
  'московская',
  'россия',
  'рф',
  'при',
  'не',
  'за',
  'на',
  'по',
  'от',
  'до',
  'из',
  'во',
  'ко',
  'со',
  'об',
  'под',
  'над',
  'без',
  'для',
  'или',
  'это',
  'она',
  'они',
  'нахожусь',
  'находится',
  'около',
  'адреса',
  'адрес',
  'уточнении',
  'уточнение',
  'уточнения',
]);

export function normalizePlace(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"']/g, '')
    .replace(/\b(г|ул|д|обл|пос|дер|р-н|мкр|ш|кв|стр|корп)\.?\b/gi, ' ')
    .replace(/[^а-я0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function placeTokens(value: string): string[] {
  const spoken = value
    .replace(/при\s+уточнени[а-яё]*\s+адреса?/gi, ' ')
    .replace(/[а-яё-]+(?:ская|ский|ское|ской)\s+(?:обл\.?|область|район)/gi, ' ')
    .replace(/\b(?:обл\.?|область|район|р-н)\b/gi, ' ');
  return normalizePlace(spoken)
    .split(' ')
    .filter((token) => token.length >= 2 && !STOP.has(token));
}

export function cardAddressLine(address: IncidentAddress): string {
  return [
    address.searchLine,
    address.subject,
    address.settlement,
    address.district,
    address.street,
    address.house,
    address.corpus,
    address.stroenie,
    address.apartment,
    address.descriptiveAddress,
  ]
    .filter(Boolean)
    .join(' ');
}

function stem(token: string): string {
  const cut = token.replace(
    /(иями|ами|ями|ого|ему|ому|его|ыми|ими|ах|ях|ов|ев|ам|ям|ом|ем|ой|ый|ий|ая|ое|ые|ие|ую|юю|а|я|ы|и|е|о|у|ю)$/u,
    '',
  );
  return cut.length >= 3 ? cut : token;
}

function samePlace(left: string, right: string): boolean {
  const a = stem(left);
  const b = stem(right);
  if (a === b) {
    return true;
  }
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return shorter.length >= 4 && longer.startsWith(shorter);
}

export function addressOverlap(expected: string, got: string): { ratio: number; missing: string[] } {
  const need = placeTokens(expected);
  if (need.length === 0) {
    return { ratio: 1, missing: [] };
  }
  const have = placeTokens(got);
  const missing = need.filter((token) => !have.some((item) => samePlace(token, item)));
  const hit = need.length - missing.length;
  return { ratio: hit / need.length, missing };
}
