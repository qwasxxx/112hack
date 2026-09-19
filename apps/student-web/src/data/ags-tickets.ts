import type { LessonSection, ServiceKind, TrainingScenario } from './scenarios';
import tickets from './ags-tickets.json';

export type AgsTicket = {
  ticket: number;
  n: number;
  situation: string;
  address: string;
};

export const AGS_TICKETS = tickets as AgsTicket[];

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function inferServices(text: string): ServiceKind[] {
  const t = text.toLowerCase();
  const out: ServiceKind[] = [];
  if (/пожар|горит|задымл|плам|дым|мусоропровод|сигнализац|возгоран/.test(t)) {
    out.push('fire');
  }
  if (/газ[^а-я]|запах газа|газовой трубы|газовой тру/.test(t) || /\bгаз\b/.test(t)) {
    out.push('gas');
  }
  if (
    /пострадал|сознан|кров|упал|ожог|астма|судорог|тонет|утоп|нож|травм|головн|отёк|отек|рожает|инсульт|задыха|дтп|наезд/.test(
      t,
    )
  ) {
    out.push('ambulance');
  }
  if (
    /дерут|оруж|полиц|угрож|изнасило|угн|завладен|подозрительн|драк|скандал|ссоря|ссора|избит|затащил|повесит|взрыв|тикает|коробка|нетрезв|попрошайн|потерял.*ребен|ребенок 4 года один/.test(
      t,
    )
  ) {
    out.push('police');
  }
  if (!out.length) {
    out.push('police');
  }
  return unique(out);
}

export function classifierNumberFor(services: ServiceKind[], text: string): string {
  const t = text.toLowerCase();
  if (services.includes('fire')) {
    return '1050101';
  }
  if (/дтп|наезд/.test(t)) {
    return '2020000';
  }
  if (/потерял.*ребен|ребенок/.test(t) && services.includes('police')) {
    return '18070000';
  }
  if (services[0] === 'ambulance') {
    return '2020000';
  }
  return '18070000';
}

function anyMatch(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function assessDifficulty(situation: string, address = ''): TrainingScenario['difficulty'] {
  const t = `${situation} ${address}`.toLowerCase();
  if (
    anyMatch(t, [
      /тонет/,
      /льдин/,
      /в воду/,
      /не умеет плавать/,
      /нож/,
      /изнасил/,
      /повесит/,
      /труп/,
      /тикает/,
      /взорвать/,
      /завладен/,
      /затащил/,
      /кричат о помощи/,
      /без сознания/,
      /потеря сознания/,
      /теряет сознание/,
      /не может разбудить/,
      /хрип/,
      /судорог/,
      /снотворн/,
      /не те лекарствен/,
      /котлован/,
      /заблокирован/,
      /электричк/,
      /потерял.*ребен/,
      /потерялся ребенок/,
      /ребенок 4 года/,
      /коробк.*провод/,
      /ожог/,
      /\d+\s*пострадав/,
      /палками/,
      /прутами/,
      /битами/,
      /рожает/,
      /отошли воды/,
      /нырнул/,
      /наезд/,
      /течет бензин/,
      /избит/,
      /задыха/,
      /рвота с кров/,
      /перекошен/,
      /в крови/,
      /окровавлен/,
      /крики о помощи/,
      /просит о помощи из-за двери/,
      /не открывает дверь/,
      /ушел.*не вернул/,
      /столб черного дыма/,
      /что горит не знает/,
      /огонь подходит/,
      /открытое пламя/,
      /травма головы/,
      /о пострадавших.*нет/,
      /источник не установлен/,
    ])
  ) {
    return 'сложный';
  }
  if (
    anyMatch(t, [
      /мегафон/,
      /поругался/,
      /громко играет музыка/,
      /ссора во дворе/,
      /соседи делают ремонт/,
      /освещен/,
      /у домофона/,
      /крепления на табло/,
      /пожарная сигнализация/,
      /нетрезв/,
    ]) ||
    (/б\/п/.test(t) && /б\/р/.test(t) && !/драк/.test(t)) ||
    (/без пострадавших/.test(t) && /без оружия/.test(t) && /дерут/.test(t))
  ) {
    return 'базовый';
  }
  return 'стандарт';
}

export function publicTheme(situation: string, services: ServiceKind[]): string {
  const t = situation.toLowerCase();
  if (/тонет|льдин|в воду|пруд|озер/.test(t)) {
    return 'Происшествие на воде';
  }
  if (/дтп|наезд/.test(t)) {
    return 'ДТП';
  }
  if (services.includes('gas') || /запах газа|газовой труб|свист от газов/.test(t)) {
    return 'Газ';
  }
  if (/пожар|горит|задымл|дым|возгоран|сигнализац|столб черного/.test(t)) {
    return 'Пожар / задымление';
  }
  if (/потерял|заблудил|не вернул|потер.*памят/.test(t)) {
    return 'Поиск человека';
  }
  if (/угон|завладен/.test(t)) {
    return 'Угон транспорта';
  }
  if (/тик|взорвать|коробк.*провод/.test(t)) {
    return 'Угроза / подозрительный предмет';
  }
  if (services.includes('ambulance')) {
    return 'Медицинский вызов';
  }
  if (
    /мегафон|музык|ссора во дворе|парковк|плитк|освещен|домофон|табло|ремонт|нетрезв/.test(t)
  ) {
    return 'Бытовое обращение';
  }
  if (services.includes('police')) {
    return 'Вызов полиции';
  }
  return 'Учебный вызов 112';
}

function titleFrom(ticket: number, n: number, theme: string): string {
  return `Билет ${ticket}.${n} — ${theme}`;
}

function openingFrom(situation: string): string {
  const head = situation.split(',')[0].trim();
  const spoken = head.charAt(0).toLowerCase() + head.slice(1);
  return `Алло, ${spoken}, помогите!`;
}

function algorithmFor(services: ServiceKind[], text: string): string[] {
  const t = text.toLowerCase();
  const steps = [
    'Представиться как оператор 112.',
    'Зафиксировать точный адрес / ориентир и подтвердить его.',
    'Выяснить, что произошло, прямо сейчас.',
    'Уточнить пострадавших, угрозу жизни, что уже сделано.',
    'Записать ФИО и телефон заявителя.',
    'Направить нужные службы, держать заявителя на линии до сбора обязательных данных.',
  ];
  if (services.includes('fire')) {
    steps.splice(3, 0, 'Уточнить, что горит, этаж, открытое пламя/дым, люди внутри, газификация, подъезд для служб.');
  }
  if (services.includes('ambulance') || /сознан|кров|упал|дтп/.test(t)) {
    steps.splice(3, 0, 'Уточнить сознание, дыхание, кровотечение, возраст, доступ к пострадавшему.');
  }
  if (services.includes('police')) {
    steps.splice(3, 0, 'Уточнить число людей, оружие, приметы, куда скрылись, есть ли угроза сейчас.');
  }
  if (services.includes('gas')) {
    steps.splice(3, 0, 'Уточнить запах/шум газа, перекрыт ли вентиль, есть ли люди в помещении, не включать электроприборы.');
  }
  return steps;
}

function checklistFor(services: ServiceKind[]): string[] {
  const items = ['Представиться как оператор 112', 'Получить точный адрес', 'Выяснить суть происшествия', 'Уточнить пострадавших / угрозу', 'Зафиксировать телефон заявителя'];
  if (services.includes('fire')) {
    items.push('Выяснить, что горит и есть ли люди');
  }
  if (services.includes('ambulance')) {
    items.push('Оценить состояние пострадавших');
  }
  if (services.includes('police')) {
    items.push('Собрать приметы и направить полицию');
  }
  items.push('Заполнить карточку происшествия');
  return items;
}

const CARD_FIELDS: TrainingScenario['cardFields'] = [
  { key: 'address', label: 'Адрес', type: 'string', required: true },
  { key: 'what_happened', label: 'Что произошло', type: 'text', required: true },
  { key: 'people', label: 'Пострадавшие / люди на месте', type: 'string', required: true },
  { key: 'caller_name', label: 'ФИО заявителя', type: 'string', required: true },
  { key: 'caller_phone', label: 'Телефон заявителя', type: 'phone', required: true },
];

function durationFor(difficulty: TrainingScenario['difficulty']): number {
  if (difficulty === 'базовый') {
    return 6;
  }
  if (difficulty === 'сложный') {
    return 10;
  }
  return 8;
}

export function ticketToScenario(ticket: AgsTicket): TrainingScenario {
  const blob = `${ticket.situation} ${ticket.address}`;
  const services = inferServices(blob);
  const difficulty = assessDifficulty(ticket.situation, ticket.address);
  const theme = publicTheme(ticket.situation, services);
  const id = `ags-${String(ticket.ticket).padStart(2, '0')}-${ticket.n}`;
  return {
    id,
    code: `Б${ticket.ticket}.${ticket.n}`,
    title: titleFrom(ticket.ticket, ticket.n, theme),
    summary: `Тренировка оператора 112. ${theme}. Обстановку выясняете на линии.`,
    services,
    durationMin: durationFor(difficulty),
    difficulty,
    theory: algorithmFor(services, blob),
    checklist: checklistFor(services),
    callerOpening: openingFrom(ticket.situation),
    cardFields: CARD_FIELDS,
    ticketNo: ticket.ticket,
    situationNo: ticket.n,
    address: ticket.address,
    situation: ticket.situation,
    classifierNumber: classifierNumberFor(services, blob),
  };
}

export const AGS_SCENARIOS: TrainingScenario[] = AGS_TICKETS.map(ticketToScenario);

export function buildLessonSystemPrompt(scenario: TrainingScenario, section: LessonSection): string {
  const situation = scenario.situation ?? scenario.summary;
  const address = scenario.address ?? '';
  const ticketLabel =
    scenario.ticketNo && scenario.situationNo
      ? `Билет ${scenario.ticketNo}, ситуация ${scenario.situationNo}`
      : scenario.code;
  const facts = [
    ticketLabel,
    `СИТУАЦИЯ: ${situation}`,
    address ? `АДРЕС: ${address}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  if (section === 'theory') {
    return [
      facts,
      `Алгоритм опроса:\n${scenario.theory.join('\n')}`,
      'Не выдумывай факты сверх билета. Критерий конца: адрес, суть, пострадавшие/угроза, телефон, какие службы нужны.',
    ].join('\n');
  }

  return [
    facts,
    'Первая фраза уже сказана — не повторяй её. Отвечай только на вопрос оператора. Адрес, имена и телефон — лишь когда спросили. Чего нет в ситуации — не знаешь. Говори словами полностью, без сокращений.',
  ]
    .filter(Boolean)
    .join('\n');
}
