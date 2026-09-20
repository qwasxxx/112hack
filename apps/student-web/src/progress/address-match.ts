import type { IncidentAddress } from '../features/arm112-simulator/model/arm112-models';

const STOP = new Set([
  'г',
  'гор',
  'город',
  'ул',
  'улица',
  'д',
  'дом',
  'обл',
  'область',
  'рн',
  'район',
  'пос',
  'поселок',
  'посёлок',
  'стр',
  'строение',
  'корп',
  'корпус',
  'москва',
  'московская',
  'россия',
  'рф',
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
  return normalizePlace(value)
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

export function addressOverlap(expected: string, got: string): { ratio: number; missing: string[] } {
  const need = placeTokens(expected);
  if (need.length === 0) {
    return { ratio: 1, missing: [] };
  }
  const have = new Set(placeTokens(got));
  const missing = need.filter((token) => !have.has(token));
  const hit = need.length - missing.length;
  return { ratio: hit / need.length, missing };
}
