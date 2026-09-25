export type TranscriptTurn = {
  role: 'caller' | 'operator';
  text: string;
  at: number;
};

export type CallPart = {
  speed: number;
  politeness: number;
  interview: number;
  points: number;
  max: 50;
  medianReplySec: number | null;
  findings: Array<{ code: string; field: string; message: string; severity: 'error' | 'warning' }>;
};

export type CallFacts = {
  opening?: string;
  address?: string;
  situation?: string;
};

const ASK = {
  address: /адрес|где это|где вы|улиц|какой дом|квартир|ориентир/,
  what: /что случилось|что произошло|что там|что горит|что случ/,
  injured: /пострада|ранен|травм|погиб|жив|цел[ыаой]|есть ли кто|кто-нибудь|кто нибудь/,
  phone: /телефон|номер|как перезвон|оставайтесь на|сотов|мобильн|для связи|перезвон/,
};

const WHAT_VOLUNTEERED =
  /пожар|горит|возгоран|задымл|дтп|авари|газ\b|мусорн|контейнер|взрыв|дым|упал|ранен|скорая|полици|запах/;

const STOP = new Set(['алло', 'помогите', 'пожалуйста', 'сейчас', 'здесь', 'там', 'это', 'надо']);

function norm(value: string): string {
  return value.toLowerCase().replace(/ё/g, 'е');
}

function significantTokens(value: string): string[] {
  return norm(value)
    .split(/[^а-я0-9]+/u)
    .filter((word) => word.length >= 4 && !STOP.has(word));
}

function callerCovers(callerText: string, source?: string): boolean {
  if (!source) {
    return false;
  }
  const words = significantTokens(source);
  if (words.length === 0) {
    return false;
  }
  const hits = words.filter((word) => callerText.includes(word)).length;
  return hits >= Math.min(2, words.length);
}

export function scoreCallRules(turns: TranscriptTurn[], facts: CallFacts = {}): CallPart {
  const spoken = turns.filter((item) => item.text.trim() && !item.text.startsWith('…'));
  const operatorText = spoken
    .filter((item) => item.role === 'operator')
    .map((item) => item.text)
    .join(' ')
    .toLowerCase();
  const callerText = spoken
    .filter((item) => item.role === 'caller')
    .map((item) => item.text)
    .join(' ');
  const callerNorm = norm(callerText);
  const findings: CallPart['findings'] = [];

  const whatKnown =
    WHAT_VOLUNTEERED.test(callerNorm) ||
    callerCovers(callerNorm, facts.opening) ||
    callerCovers(callerNorm, facts.situation);
  const addressKnown = callerCovers(callerNorm, facts.address) || /\bдом\s*\d+/u.test(callerNorm);
  const injuredKnown = /пострада|ранен|травм|погиб/.test(callerNorm);

  const asked = {
    address: ASK.address.test(operatorText) || addressKnown,
    what: ASK.what.test(operatorText) || whatKnown,
    injured: ASK.injured.test(operatorText) || injuredKnown,
    phone: ASK.phone.test(operatorText),
  };
  const askedCount = Object.values(asked).filter(Boolean).length;
  const interview = askedCount === 0 ? 4 : Math.round((askedCount / 4) * 20);
  if (!asked.address) {
    findings.push({ code: 'ask-address', field: 'Опрос', message: 'Не спросили адрес', severity: 'warning' });
  }
  if (!asked.what) {
    findings.push({ code: 'ask-what', field: 'Опрос', message: 'Не спросили, что случилось', severity: 'warning' });
  }
  if (!asked.injured) {
    findings.push({ code: 'ask-injured', field: 'Опрос', message: 'Не уточнили пострадавших', severity: 'warning' });
  }
  if (!asked.phone) {
    findings.push({ code: 'ask-phone', field: 'Опрос', message: 'Не зафиксировали телефон / «оставайтесь на линии»', severity: 'warning' });
  }

  const gaps: number[] = [];
  for (let i = 0; i < spoken.length; i += 1) {
    const line = spoken[i];
    if (line.role !== 'caller') {
      continue;
    }
    const next = spoken.slice(i + 1).find((item) => item.role === 'operator');
    if (!next || !line.at || !next.at) {
      continue;
    }
    const sec = Math.max(0, (next.at - line.at) / 1000);
    if (sec < 90) {
      gaps.push(sec);
    }
  }
  const medianReplySec = gaps.length ? [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : null;
  let speed = 11;
  if (medianReplySec == null) {
    speed = spoken.some((item) => item.role === 'operator') ? 11 : 6;
    findings.push({
      code: 'speed-unknown',
      field: 'Скорость ответа',
      message: 'Мало реплик, чтобы оценить паузу',
      severity: 'warning',
    });
  } else if (medianReplySec <= 7) {
    speed = 15;
  } else if (medianReplySec <= 12) {
    speed = 12;
  } else if (medianReplySec <= 20) {
    speed = 9;
    findings.push({
      code: 'speed-slow',
      field: 'Скорость ответа',
      message: `Средняя пауза ${Math.round(medianReplySec)} с — не критично, можно чуть быстрее`,
      severity: 'warning',
    });
  } else {
    speed = 6;
    findings.push({
      code: 'speed-slow',
      field: 'Скорость ответа',
      message: `Средняя пауза ${Math.round(medianReplySec)} с`,
      severity: 'warning',
    });
  }

  let politeness = 12;
  if (/заткн|дурак|идиот|да блин|чё молч/.test(operatorText)) {
    politeness = 4;
    findings.push({
      code: 'rude',
      field: 'Вежливость',
      message: 'В репликах есть грубость',
      severity: 'error',
    });
  } else if (/спасибо|пожалуйста|оставайтесь|помощь|спокойн|здравствуй/.test(operatorText)) {
    politeness = 15;
  }

  const points = Math.max(0, Math.min(50, speed + politeness + interview));
  return { speed, politeness, interview, points, max: 50, medianReplySec, findings };
}

export function applyAiPoliteness(part: CallPart, politeness: number, _comment?: string): CallPart {
  const next = Math.max(4, Math.min(15, Math.round(politeness)));
  const points = Math.max(0, Math.min(50, part.speed + next + part.interview));
  return { ...part, politeness: next, points, findings: part.findings.filter((item) => item.code !== 'rude') };
}
