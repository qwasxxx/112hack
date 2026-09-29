import { type TrainingScenario } from '../data/scenarios';
import { scoreDds, type DdsDraft, type TicketFacts } from '../features/dds-training/incoming-card';
import type { DdsCardDecision, DdsServiceStatus } from '../features/dds-training/types';
import { inspectOperatorText } from './text-quality';
import {
  DDS_FIRST_RECORD_LIMIT_SEC,
  DDS_OPEN_LIMIT_SEC,
  PASS_SCORE,
  type LessonFinding,
  type LessonRecord,
} from './types';

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
  dialogue?: { speaker: string; role: 'operator' | 'caller'; text: string }[];
  history?: { status: string; naryad?: string; comment?: string }[];
  openMs?: number | null;
  firstRecordMs?: number | null;
  chiefCalled?: boolean;
  crewCalled?: boolean;
  crewInbound?: 'accepted' | 'declined' | 'missed';
  reportedTo112?: boolean;
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

const FULL_CYCLE = ['Принята', 'Начало реагирования', 'Прибытие', 'Проведение работ', 'Работы завершены'];

function cycleComplete(history: { status: string }[]): boolean {
  const have = new Set(history.map((item) => item.status));
  return FULL_CYCLE.every((status) => have.has(status));
}

function motivated(history: { status: string; comment?: string }[] | undefined, status: string): boolean {
  return Boolean(
    history?.some((item) => item.status === status && (item.comment ?? '').trim().length >= 4),
  );
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
  const status = input.workplaceStatus ?? '';

  if (input.role === 'foreign') {
    const refused = status === 'Не принято';
    const ok =
      input.decision === 'transfer' ||
      (refused && (!input.history || motivated(input.history, status)));
    if (!ok) {
      findings.push({
        code: 'dds-transfer',
        field: 'Профиль ДДС',
        message: refused
          ? '«Не принято» без причины: напишите, почему карточку не взяли в работу'
          : `Карточка «${input.scenario.code}» не вашего профиля — её надо было передать или поставить «Не принято», а не направлять свою бригаду`,
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
  const expected = input.facts.services;
  const matched = contacts.filter((item) => calledService(item.service, expected));
  const said = matched.map((item) => item.said.toLowerCase().replace(/ё/g, 'е')).join(' ');
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
    servicePoints = 40;
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
        message: `В разговоре со службой не назвали адрес`,
        severity: 'warning',
      });
    } else {
      servicePoints += 8;
    }
    if (!/наряд|бригад|выез|направ|отправ/.test(said)) {
      findings.push({
        code: 'dds-service-crew',
        field: 'Связь со службой',
        message: 'Службе не сказали направить наряд или бригаду',
        severity: 'warning',
      });
    } else {
      servicePoints += 7;
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
    acceptPoints = 5;
  }
  let closePoints = 0;
  const refused = status === 'Отказ от выполнения работ' || status === 'Не принято';
  if (status === 'Работы завершены') {
    if (input.history && !cycleComplete(input.history)) {
      findings.push({
        code: 'dds-close',
        field: 'Закрытие',
        message: 'Карточка закрыта без полного цикла: принято, начало реагирования, прибытие, работы, завершение',
        severity: 'error',
      });
    } else {
      closePoints = 5;
    }
  } else if (refused) {
    if (input.history && !motivated(input.history, status)) {
      findings.push({
        code: 'dds-close',
        field: 'Отказ',
        message: 'Отказ без причины: нужна запись, почему карточку не взяли в работу',
        severity: 'error',
      });
    } else {
      findings.push({
        code: 'dds-close',
        field: 'Закрытие',
        message: 'Своя карточка закрыта отказом, а не полным циклом работ',
        severity: 'error',
      });
    }
  } else {
    findings.push({
      code: 'dds-close',
      field: 'Закрытие',
      message: 'Нет отметки «Работы завершены»',
      severity: 'error',
    });
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
    naryadPoints = 6;
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
    fioPoints = 6;
  }

  const told112 = Boolean(input.crewCalled && input.reportedTo112);
  let injuredPoints = 0;
  if (check.injuredOk || told112) {
    injuredPoints = 8;
  } else {
    findings.push({
      code: 'dds-injured',
      field: 'Пострадавшие',
      message: `В карточке «${input.draft.injured || 'пусто'}», по месту «${input.facts.injured}». Поле 112 не правится: узнайте у бригады и сообщите в 112`,
      severity: 'error',
    });
  }

  let phonePoints = 0;
  if (check.phoneOk || told112) {
    phonePoints = 7;
  } else {
    findings.push({
      code: 'dds-phone',
      field: 'Телефон',
      message: 'Телефон в карточке 112 пустой или неверный. Его называет бригада, затем диспетчер сообщает об ошибке в 112',
      severity: 'error',
    });
  }

  let timerPoints = 8;
  if (input.openMs != null && input.openMs > DDS_OPEN_LIMIT_SEC * 1000) {
    timerPoints -= 4;
    findings.push({
      code: 'dds-open-late',
      field: 'Открытие',
      message: `30 секунд с появления строки до открытия. Факт ${Math.round(input.openMs / 1000)} с`,
      severity: 'warning',
    });
  }
  if (input.firstRecordMs != null && input.firstRecordMs > DDS_FIRST_RECORD_LIMIT_SEC * 1000) {
    timerPoints -= 4;
    findings.push({
      code: 'dds-first-late',
      field: 'Первая запись',
      message: `3 минуты на открытие и первую запись: статус и текст. Факт ${Math.round(input.firstRecordMs / 1000)} с`,
      severity: 'warning',
    });
  }
  timerPoints = Math.max(0, timerPoints);

  const routeTracked = input.chiefCalled != null || input.crewCalled != null;
  if (routeTracked) {
    servicePoints = Math.min(servicePoints, 40);
  }
  let routePoints = 0;
  if (input.chiefCalled === true) {
    routePoints += 8;
  } else if (input.chiefCalled === false) {
    findings.push({
      code: 'dds-chief',
      field: 'Начальник',
      message: 'Не было доклада вышестоящему начальнику',
      severity: 'error',
    });
  }
  const inbound = input.crewInbound;
  const departureRecorded = Boolean(input.history?.some((item) => item.status === 'Начало реагирования'));
  if (inbound == null) {
    if (input.crewCalled === true) {
      routePoints += 7;
    } else if (input.crewCalled === false) {
      findings.push({
        code: 'dds-crew',
        field: 'Бригада',
        message: 'Не было связи с руководителем бригады',
        severity: 'error',
      });
    }
  } else {
    if (input.crewCalled === true) {
      routePoints += 4;
    } else if (input.crewCalled === false) {
      findings.push({
        code: 'dds-crew',
        field: 'Бригада',
        message: 'Не было связи с руководителем бригады',
        severity: 'error',
      });
    }
    if (inbound === 'accepted' && departureRecorded) {
      routePoints += 3;
    } else {
      findings.push({
        code: 'dds-crew-report',
        field: 'Доклад о выезде',
        message:
          inbound === 'declined'
            ? 'Доклад бригады о выезде сброшен'
            : inbound === 'missed'
              ? 'Бригада звонила о выезде, вызов не принят'
              : 'Доклад о выезде принят, статус «Начало реагирования» не поставлен',
        severity: 'error',
      });
    }
  }

  findings.push(...inspectOperatorText('Описание', input.draft.description, { minChars: 8 }));
  const parts: DdsParts = {
    call: servicePoints + routePoints,
    card: acceptPoints + closePoints + naryadPoints + fioPoints,
    facts: injuredPoints + phonePoints,
    timer: timerPoints,
  };
  const raw = parts.call + parts.card + parts.facts + parts.timer;
  const decisionOk = input.decision === 'dispatch';
  const points = decisionOk ? Math.max(0, Math.min(100, raw)) : Math.min(40, Math.round(raw / 2));
  const callReady = routeTracked ? servicePoints === 40 && routePoints === 15 : servicePoints === 55;
  const factsReady = injuredPoints === 8 && phonePoints === 7;
  const ok =
    decisionOk &&
    callReady &&
    factsReady &&
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
    recs.push('Ошибку телефона или пострадавших сообщает бригада с места. Затем звонок в 112. Поля карточки 112 сами не правятся.');
  }
  if (scored.some((item) => item.findings.some((finding) => finding.code === 'dds-service-call'))) {
    recs.push('По своей карточке нужно позвонить в нужную службу, назвать адрес и попросить направить наряд.');
  }
  if (findings.some((item) => item.code === 'dds-chief' || item.code === 'dds-crew')) {
    recs.push('Кроме службы, нужен доклад начальнику и связь с руководителем бригады.');
  }
  if (findings.some((item) => item.code === 'dds-crew-report')) {
    recs.push('Когда бригада звонит о выезде, примите вызов и поставьте «Начало реагирования».');
  }
  if (scored.some((item) => item.findings.some((finding) => finding.code === 'dds-fio' || finding.code === 'dds-naryad'))) {
    recs.push('ФИО заявителя и номер наряда должны быть в карточке, одних статусов мало.');
  }
  if (findings.some((item) => item.code === 'dds-accept' || item.code === 'dds-close')) {
    recs.push('Сначала «Принята», затем наряд и статусы реагирования, в конце «Работы завершены».');
  }
  if (findings.some((item) => item.code === 'dds-open-late' || item.code === 'dds-first-late')) {
    recs.push('30 секунд — открыть карточку с момента строки. 3 минуты — первая запись: статус и текст. Дальше время не нормируется.');
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
    cardTimerLimitSec: DDS_OPEN_LIMIT_SEC,
    cardTimerExceeded: findings.some((item) => item.code === 'dds-open-late' || item.code === 'dds-first-late'),
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
      const talks = (item.dialogue ?? []).length
        ? (item.dialogue ?? []).map((line) => ({
            role: line.role,
            speaker: line.speaker,
            text: line.text,
          }))
        : (item.contacts ?? []).map((contact) => ({
            role: 'operator' as const,
            speaker: 'Диспетчер',
            text: `${contact.service}: ${contact.said}`,
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
        ...(item.role === 'own' && item.chiefCalled != null
          ? [
              {
                label: `${prefix} · начальник`,
                expected: 'доклад',
                got: item.chiefCalled ? 'был' : 'не было',
                state: item.chiefCalled ? ('match' as const) : ('miss' as const),
                points: item.chiefCalled ? 8 : 0,
                max: 8,
              },
              ...(item.crewInbound != null
                ? [
                    {
                      label: `${prefix} · бригада`,
                      expected: 'связь',
                      got: item.crewCalled ? 'была' : 'не было',
                      state: item.crewCalled ? ('match' as const) : ('miss' as const),
                      points: item.crewCalled ? 4 : 0,
                      max: 4,
                    },
                    {
                      label: `${prefix} · доклад о выезде`,
                      expected: 'принят и записан',
                      got:
                        item.crewInbound === 'accepted' &&
                        (item.history ?? []).some((event) => event.status === 'Начало реагирования')
                          ? 'записан'
                          : 'не записан',
                      state:
                        item.crewInbound === 'accepted' &&
                        (item.history ?? []).some((event) => event.status === 'Начало реагирования')
                          ? ('match' as const)
                          : ('miss' as const),
                      points:
                        item.crewInbound === 'accepted' &&
                        (item.history ?? []).some((event) => event.status === 'Начало реагирования')
                          ? 3
                          : 0,
                      max: 3,
                    },
                  ]
                : [
                    {
                      label: `${prefix} · бригада`,
                      expected: 'связь',
                      got: item.crewCalled ? 'была' : 'не было',
                      state: item.crewCalled ? ('match' as const) : ('miss' as const),
                      points: item.crewCalled ? 7 : 0,
                      max: 7,
                    },
                  ]),
            ]
          : []),
      ];
    }),
  };
}
