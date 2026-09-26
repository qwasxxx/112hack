const CYR_LETTER = /[А-Яа-яЁё]/;
const FOREIGN_LETTER = /(?![А-Яа-яЁё])\p{L}/u;
const OTHER_LETTER = /(?![А-Яа-яЁёA-Za-z])\p{L}/u;
const DIGIT = /\d/;
const SEGMENT = /[^,.;:!?…]+[,.;:!?…]*|[,.;:!?…]+/g;
const TAIL_PUNCT = /[.!?…]+$/;
const HOMOGLYPHS: Record<string, string> = {
  A: 'А',
  a: 'а',
  B: 'В',
  C: 'С',
  c: 'с',
  E: 'Е',
  e: 'е',
  H: 'Н',
  K: 'К',
  k: 'к',
  M: 'М',
  O: 'О',
  o: 'о',
  P: 'Р',
  p: 'р',
  T: 'Т',
  X: 'Х',
  x: 'х',
  y: 'у',
};

export function normalizeTranscript(text: string): string {
  return text.split(/\s+/).filter(Boolean).join(' ').trim();
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(new RegExp(pattern, 'gu'))?.length ?? 0;
}

function hasMatch(text: string, pattern: RegExp): boolean {
  return new RegExp(pattern, pattern.flags.includes('u') ? 'u' : '').test(text);
}

function translateHomoglyphs(token: string): string {
  return [...token].map((char) => HOMOGLYPHS[char] ?? char).join('');
}

function onlyHomoglyphs(token: string): boolean {
  const latin = token.match(/[A-Za-z]/g) ?? [];
  return latin.length > 0 && latin.every((char) => HOMOGLYPHS[char] !== undefined);
}

function russianToken(token: string): string {
  if (!hasMatch(token, FOREIGN_LETTER)) {
    return token;
  }
  const cyr = countMatches(token, CYR_LETTER);
  const foreign = countMatches(token, FOREIGN_LETTER);
  const digits = DIGIT.test(token);
  const repairable = onlyHomoglyphs(token) && !hasMatch(token, OTHER_LETTER);
  if (repairable && (cyr || digits || foreign === 1)) {
    return translateHomoglyphs(token);
  }
  if (digits || cyr > foreign) {
    return token.replace(new RegExp(FOREIGN_LETTER, 'gu'), '');
  }
  const tail = token.match(TAIL_PUNCT);
  return tail?.[0] ?? '';
}

function russianSegment(segment: string): string {
  if (!hasMatch(segment, FOREIGN_LETTER)) {
    return segment;
  }
  if (!CYR_LETTER.test(segment)) {
    return '';
  }
  const lead = segment.startsWith(' ') ? ' ' : '';
  return `${lead}${segment.split(/\s+/).map(russianToken).join(' ')}`;
}

export function gateRussianOperatorText(text: string): string {
  const raw = normalizeTranscript(text || '');
  if (!raw) {
    return '';
  }
  if (!hasMatch(raw, FOREIGN_LETTER)) {
    return CYR_LETTER.test(raw) || DIGIT.test(raw) ? raw : '';
  }
  const parts = raw.match(SEGMENT) ?? [];
  let spoken = normalizeTranscript(parts.map(russianSegment).join(''));
  spoken = spoken.replace(/\s+([,.;:!?…])/g, '$1');
  spoken = spoken.replace(/([,;:])(?:\s*[,;:])+/g, '$1');
  spoken = spoken.replace(/[,;:]\s*([.!?…])/g, '$1');
  spoken = spoken.replace(/^[-–—,.;:!?…\s]+/, '');
  spoken = spoken.replace(/[-–—,;:\s]+$/, '').trim();
  if (!CYR_LETTER.test(spoken) && !DIGIT.test(spoken)) {
    return '';
  }
  return spoken;
}

const SHORT_REPAIRS: Record<string, string> = {
  низ: 'Нет',
  неж: 'Нет',
  нэт: 'Нет',
  нетт: 'Нет',
  неа: 'Нет',
  даа: 'Да',
};

export function repairShortOperatorAnswer(text: string): string {
  const raw = normalizeTranscript(text || '');
  if (!raw) {
    return raw;
  }
  const punct = /[.!?]$/.test(raw) ? raw.slice(-1) : '';
  const core = punct ? raw.slice(0, -1).trim() : raw;
  const tokens = core.split(/\s+/);
  if (tokens.length !== 1) {
    return raw;
  }
  const fixed = SHORT_REPAIRS[tokens[0].toLowerCase().replace(/ё/g, 'е')];
  return fixed ? `${fixed}${punct}` : raw;
}

const JUNK = ['сэньтью', 'сэнкью', 'сенкью', 'сэнк ю', 'фондюши', 'субтитр'];

export function polishOperatorTranscript(text: string): string {
  const spoken = repairShortOperatorAnswer(gateRussianOperatorText(text));
  const low = spoken.toLowerCase();
  if (!spoken || JUNK.some((item) => low.includes(item))) {
    return '';
  }
  return spoken;
}

export function isEnglishOnlyTranscript(text: string): boolean {
  return gateRussianOperatorText(text) === '';
}
