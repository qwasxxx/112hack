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

const ASK = {
  address: /адрес|где это|где вы|улиц|какой дом|квартир|ориентир/,
  what: /что случилось|что произошло|что там|что горит|что случ/,
  injured: /пострадав|ранен|жив\b|кто пострадал|есть ли люди/,
  phone: /телефон|номер|как перезвон|оставайтесь на/,
};

export function scoreCallRules(turns: TranscriptTurn[]): CallPart {
  const spoken = turns.filter((item) => item.text.trim() && !item.text.startsWith('…'));
  const operatorText = spoken
    .filter((item) => item.role === 'operator')
    .map((item) => item.text)
    .join(' ')
    .toLowerCase();
  const findings: CallPart['findings'] = [];

  const asked = {
    address: ASK.address.test(operatorText),
    what: ASK.what.test(operatorText),
    injured: ASK.injured.test(operatorText),
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
