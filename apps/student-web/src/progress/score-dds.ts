import { type TrainingScenario } from '../data/scenarios';
import { scoreDds, type DdsDraft, type TicketFacts } from '../features/dds-training/incoming-card';
import type { DdsCardDecision, DdsServiceStatus } from '../features/dds-training/types';
import { inspectOperatorText } from './text-quality';
import { CARD_TIMER_LIMIT_SEC, PASS_SCORE, type LessonFinding, type LessonRecord } from './types';

export type DdsShiftCardInput = {
  scenario: TrainingScenario;
  draft: DdsDraft;
  facts: TicketFacts;
  role: 'own' | 'foreign';
  decision: DdsCardDecision;
  elapsedMs: number;
  naryad?: string;
  workplaceStatus?: string;
  callback?: boolean;
  contacts?: { service: string; said: string }[];
  history?: { status: string; naryad?: string; comment?: string }[];
};

type DdsParts = {
  call: number;
  card: number;
  facts: number;
  timer: number;
};

type ScoredCard = {
  id: string;
  role: 'own' | 'foreign';
  decision: DdsCardDecision;
  servicesOk: boolean;
  injuredOk: boolean;
  phoneOk: boolean;
  extra: TrainingScenario['services'];
  missing: TrainingScenario['services'];
  elapsedMs: number;
  ok: boolean;
  findings: LessonFinding[];
  points: number;
  parts: DdsParts;
};

const SERVICE_MARK: Record<TrainingScenario['services'][number], string[]> = {
  fire: ['101', 'пожар'],
  police: ['102', 'полиц'],
  ambulance: ['103', 'скор'],
  gas: ['104', 'газ'],
};

function calledService(label: string, expected: TrainingScenario['services']): boolean {
  const text = label.toLowerCase().replace(/ё/g, 'е');
  return expected.some((kind) => SERVICE_MARK[kind].some((mark) => text.includes(mark)));
}

const ACCEPTED: DdsServiceStatus[] = [
  'Принята',
  'Начало реагирования',
  'Прибытие',
  'Проведение работ',
  'Работы завершены',
];

function acceptedStatus(status?: string): boolean {
  return Boolean(status && (ACCEPTED as string[]).includes(status));
}

export function scoreDdsCard(input: DdsShiftCardInput): ScoredCard {
  const check = scoreDds(input.draft, input.facts);
  const findings: LessonFinding[] = [];
  const elapsedSeconds = Math.max(0, Math.round(input.elapsedMs / 1000));
  const status = input.workplaceStatus ?? '';

  if (input.role === 'foreign') {
    const ok = input.decision === 'transfer' || status === 'Не принято';
    if (!ok) {
      findings.push({
        code: 'dds-transfer',
        field: 'Профиль ДДС',
        message: `Карточка «${input.scenario.code}» не вашего профиля — её надо было передать или поставить «Не принято», а не направлять свою бригаду`,
        severity: 'error',
      });
    }
    return {
      id: input.scenario.id,
      role: input.role,
      decision: input.decision,
      ...check,
      elapsedMs: input.elapsedMs,
      ok,
      findings,
      points: ok ? 100 : 20,
      parts: { call: 0, card: 0, facts: 0, timer: 0 },
    };
  }

  if (input.decision !== 'dispatch') {
    findings.push({
      code: 'dds-own-transfer',
      field: 'Профиль ДДС',
      message: `Карточка «${input.scenario.code}» вашего профиля: её надо принять, а не передавать дальше`,
      severity: 'error',
    });
  }

  const contacts = input.contacts ?? [];
  const said = contacts.map((item) => item.said.toLowerCase().replace(/ё/g, 'е')).join(' ');
  const expected = input.facts.services;
  const matched = contacts.filter((item) => calledService(item.service, expected));
  let servicePoints = 0;
  if (contacts.length === 0) {
    findings.push({
      code: 'dds-service-call',
      field: 'Связь со службой',
      message: 'Не позвонили в нужную службу и не попросили направить наряд на адрес',
      severity: 'error',
    });
  } else if (expected.length > 0 && matched.length === 0) {
    findings.push({
      code: 'dds-service-call',
      field: 'Связь со службой',
      message: `Звонок был не в ту службу. Нужна: ${expected.join(', ')}`,
      severity: 'error',
    });
  } else {
    servicePoints = 22;
    const place = input.facts.address
      .toLowerCase()
      .replace(/ё/g, 'е')
      .split(/[^а-я0-9]+/u)
      .filter((word) => word.length >= 5 && !['москва', 'область', 'напротив', 'большой', 'большого'].includes(word));
    const namedPlace = place.filter((word) => said.includes(word.slice(0, 5))).length;
    if (place.length > 0 && namedPlace < Math.min(2, place.length)) {
      findings.push({
        code: 'dds-service-address',
        field: 'Связь со службой',
        message: `В разговоре с ${contacts.map((item) => item.service).join(', ')} не назвали адрес`,
        severity: 'warning',
      });
    } else {
      servicePoints += 12;
    }
    if (!/наряд|бригад|выез|направ|отправ/.test(said)) {
      findings.push({
        code: 'dds-service-crew',
        field: 'Связь со службой',
        message: 'Службе не сказали направить наряд или бригаду',
        severity: 'warning',
      });
    } else {
      servicePoints += 10;
    }
  }

  let acceptPoints = 0;
  if (!acceptedStatus(status)) {
    findings.push({
      code: 'dds-accept',
      field: 'Приём карточки',
      message: 'Нет статуса «Принята»: карточка не подтверждена как зона ответственности',
      severity: 'error',
    });
  } else {
    acceptPoints = 8;
  }
  let closePoints = 0;
  if (status !== 'Работы завершены') {
    findings.push({
      code: 'dds-close',
      field: 'Закрытие',
      message: status === 'Отказ от выполнения работ'
        ? 'Отказ от работ по своей карточке'
        : 'Нет отметки «Работы завершены» и возврата карточки в 112',
      severity: 'error',
    });
  } else {
    closePoints = 8;
  }
  let naryadPoints = 0;
  if (!(input.naryad ?? '').trim()) {
    findings.push({
      code: 'dds-naryad',
      field: 'Наряд',
      message: 'Не указан номер наряда',
      severity: 'error',
    });
  } else {
    naryadPoints = 10;
  }
  let fioPoints = 0;
  const fio = input.draft.callerName.trim();
  if (fio.length < 5) {
    findings.push({
      code: 'dds-fio',
      field: 'ФИО заявителя',
      message: 'ФИО заявителя не заполнено',
      severity: 'error',
    });
  } else {
    fioPoints = 8;
  }

  let injuredPoints = 0;
  if (!check.injuredOk) {
    findings.push({
      code: 'dds-injured',
      field: 'Пострадавшие',
      message: `Эталон: ${input.facts.injured}. В карточке: ${input.draft.injured || 'пусто'}`,
      severity: 'error',
    });
  } else {
    injuredPoints = 8;
  }

  let phonePoints = 0;
  if (!check.phoneOk) {
    findings.push({
      code: 'dds-phone',
      field: 'Телефон',
      message: 'Номер для связи не заполнен',
      severity: 'error',
    });
    if (!input.callback) {
      findings.push({
        code: 'dds-callback',
        field: 'Обратный звонок',
        message: 'Телефон пустой — нужно было перезвонить заявителю и уточнить номер',
        severity: 'warning',
      });
    }
  } else {
    phonePoints = 8;
  }

  let timerPoints = 6;
  if (elapsedSeconds > CARD_TIMER_LIMIT_SEC) {
    timerPoints = elapsedSeconds > 60 ? 0 : 3;
    findings.push({
      code: 'timer-over',
      field: 'Время обработки',
      message: `Норматив ${CARD_TIMER_LIMIT_SEC} с, факт ${elapsedSeconds} с`,
      severity: 'warning',
    });
  }

  findings.push(...inspectOperatorText('Описание', input.draft.description, { minChars: 8 }));
  const parts: DdsParts = {
    call: servicePoints,
    card: acceptPoints + closePoints + naryadPoints + fioPoints,
    facts: injuredPoints + phonePoints,
    timer: timerPoints,
  };
  const raw = parts.call + parts.card + parts.facts + parts.timer;
  const decisionOk = input.decision === 'dispatch';
  const points = decisionOk ? Math.max(0, Math.min(100, raw)) : Math.min(40, Math.round(raw / 2));
  const ok =
    decisionOk &&
    servicePoints === 44 &&
    check.injuredOk &&
    check.phoneOk &&
    fioPoints > 0 &&
    acceptedStatus(status) &&
    Boolean((input.naryad ?? '').trim()) &&
    status === 'Работы завершены';

  return {
    id: input.scenario.id,
    role: input.role,
    decision: input.decision,
    ...check,
    elapsedMs: input.elapsedMs,
    ok,
    findings,
    points,
    parts,
  };
}

export function scoreDdsLesson(input: {
  scenario: TrainingScenario;
  operatorLogin: string;
  draft: DdsDraft;
  facts: TicketFacts;
  startedAt: string;
  completedAt: string;
  elapsedMs: number;
  cards?: DdsShiftCardInput[];
}): Omit<LessonRecord, 'id'> {
  const cards = input.cards ?? [
    {
      scenario: input.scenario,
      draft: input.draft,
      facts: input.facts,
      role: 'own' as const,
      decision: 'dispatch' as const,
      elapsedMs: input.elapsedMs,
    },
  ];
  const scored = cards.map(scoreDdsCard);
  const findings = scored.flatMap((item) => item.findings);
  const elapsedSeconds = Math.max(
    0,
    Math.round(scored.reduce((sum, item) => sum + item.elapsedMs, 0) / 1000),
  );
  const score = Math.round(scored.reduce((sum, item) => sum + item.points, 0) / scored.length);
  const recs: string[] = [];
  if (scored.some((item) => item.role === 'foreign' && !item.ok)) {
    recs.push('Чужой профиль не обрабатывают своей бригадой — карточку передают в нужную ДДС.');
  }
  if (scored.some((item) => item.role === 'own' && item.decision !== 'dispatch')) {
    recs.push('Карточку своего профиля нужно принять и направить, а не отдавать соседям.');
  }
  if (scored.some((item) => item.role === 'own' && !item.injuredOk)) {
    recs.push('Если в описании есть пострадавший, признак «пострадавшие» не может быть «нет».');
  }
  if (scored.some((item) => item.role === 'own' && !item.phoneOk)) {
    recs.push('Телефон для связи обязателен. Если 112 его стёр — перезвоните заявителю.');
  }
  if (scored.some((item) => item.findings.some((finding) => finding.code === 'dds-service-call'))) {
    recs.push('По своей карточке нужно позвонить в нужную службу, назвать адрес и попросить направить наряд.');
  }
  if (scored.some((item) => item.findings.some((finding) => finding.code === 'dds-fio' || finding.code === 'dds-naryad'))) {
    recs.push('ФИО заявителя и номер наряда должны быть в карточке, одних статусов мало.');
  }
  if (findings.some((item) => item.code === 'dds-accept' || item.code === 'dds-close')) {
    recs.push('Сначала «Принята», затем наряд и статусы реагирования, в конце «Работы завершены».');
  }
  if (elapsedSeconds > CARD_TIMER_LIMIT_SEC * scored.length) {
    recs.push('Обработка карточки ДДС тоже в нормативе 30 секунд на карточку.');
  }

  const serviceVeto = false;
  const foreignVeto = scored.some((item) => item.role === 'foreign' && !item.ok);

  return {
    operatorLogin: input.operatorLogin,
    mode: 'dds',
    scenarioId: input.scenario.id,
    scenarioCode: input.scenario.code,
    scenarioTitle: input.scenario.title,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    elapsedSeconds,
    reactionSeconds: null,
    cardTimerSeconds: elapsedSeconds,
    cardTimerLimitSec: CARD_TIMER_LIMIT_SEC,
    cardTimerExceeded: scored.some((item) => item.elapsedMs > CARD_TIMER_LIMIT_SEC * 1000),
    score,
    passed: score >= PASS_SCORE && !serviceVeto && !foreignVeto,
    findings,
    recommendations: recs.slice(0, 4),
    summary: `${score} · ${scored.filter((item) => item.ok).length}/${scored.length} карточек · ${elapsedSeconds} с`,
    transcript: cards.flatMap((item) => {
      const head = item.scenario.code;
      const steps = (item.history ?? []).map((event) => ({
        role: 'operator' as const,
        speaker: 'Статус',
        text: `${head}: ${event.status}${event.naryad ? `, наряд ${event.naryad}` : ''}${event.comment ? `. ${event.comment}` : ''}`,
      }));
      const talks = (item.contacts ?? []).map((contact) => ({
        role: 'caller' as const,
        speaker: contact.service,
        text: contact.said,
      }));
      return [...steps, ...talks];
    }),
    reviewFields: cards.flatMap((item, index) => {
      const who = item.role === 'foreign' ? 'Чужая' : 'Своя';
      const prefix = `${index + 1}. ${who}`;
      const statusExpected = item.role === 'foreign' ? 'Не принято' : 'Работы завершены';
      const statusGot = item.workplaceStatus ?? '';
      return [
        {
          label: `${prefix} · адрес`,
          expected: item.facts.address,
          got: item.draft.address,
          state: item.draft.address.trim() ? 'partial' : 'empty',
          points: 0,
          max: 0,
        },
        {
          label: `${prefix} · телефон`,
          expected: item.facts.callerPhone,
          got: item.draft.callerPhone,
          state: item.draft.callerPhone.trim() ? 'partial' : 'empty',
          points: 0,
          max: 0,
        },
        {
          label: `${prefix} · пострадавшие`,
          expected: item.facts.injured,
          got: item.draft.injured,
          state: item.draft.injured.trim() === item.facts.injured.trim() ? 'match' : 'miss',
          points: 0,
          max: 0,
        },
        {
          label: `${prefix} · статус`,
          expected: statusExpected,
          got: statusGot,
          state: statusGot === statusExpected ? 'match' : 'miss',
          points: 0,
          max: 0,
        },
        {
          label: `${prefix} · наряд`,
          expected: item.role === 'foreign' ? 'не нужен' : 'номер бригады',
          got: item.naryad ?? '',
          state: item.role === 'foreign' || Boolean(item.naryad?.trim()) ? 'match' : 'empty',
          points: 0,
          max: 0,
        },
      ] ;
    }),
  };
}
