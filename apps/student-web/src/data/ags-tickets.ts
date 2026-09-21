import type { CallerTtsVoice, LessonSection, ServiceKind, TrainingScenario } from './scenarios';
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
  if (services.includes('fire') && /пожар|горит|задымл|плам|возгоран|мусоропровод/.test(t)) {
    return '1050101';
  }
  if (/дерут|драк/.test(t)) {
    return /10-15|масс|палкам|прут/.test(t) ? '15060202' : '15060201';
  }
  if ((/дтп|наезд/.test(t) || /сбил|столкнов/.test(t)) && !/упал сам|упал с велосипеда/.test(t)) {
    return '2020000';
  }
  if (/потерял.*ребен/.test(t) && services.includes('police')) {
    return '18070000';
  }
  if (/без сознания|потеря сознания|теряет сознание/.test(t)) {
    return '22020000';
  }
  if (/рожает|отошли воды|беремен/.test(t)) {
    return '22030000';
  }
  if (
    /упал|травм|отек|отёк|велосипед|перелом|ушибли|головн|астма|судорог|кровоточ/.test(t) ||
    services.includes('ambulance')
  ) {
    return '22530000';
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

const OPENING_SKIP =
  /^(пострадавших нет|без пострадавших|без оружия|03 не треб.*|дом не газифицирован|дом газифицирован|этажность.*|б\/п|б\/р|наблюдают с улицы|открытого пламени не видит|упал сам|(на вид\s+)?\d+\s*лет)$/i;
const OPENING_FIO = /^[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?(?:\s+[А-ЯЁ][а-яё]+){1,2}$/;
const OPENING_SURNAME = /^[А-ЯЁ][а-яё]+(?:ов|ова|ев|ева|ёв|ёва|ин|ина|ын|ына|ский|ская|цкий|цкая)$/;

function extractPhone(text: string): string | undefined {
  const match = text.match(
    /(?:тел\.?\s*)?(?:\+?7|8)?[\s\-()]*9\d{2}[\s\-()]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}|\b9\d{9}\b|\b\d{10,11}\b/,
  );
  return match?.[0].replace(/[^\d]/g, '') || undefined;
}

function extractCallerHint(situation: string): string | undefined {
  if (/вызывает мама|звонит мама/i.test(situation)) {
    return 'мама. Имени заявителя в билете нет — не выдумывай Свету, Марию и любые другие имена. Если спросили как зовут: «я мама»';
  }
  if (/вызывает супруг/i.test(situation)) {
    return 'супруг. Имени в билете нет, не выдумывай';
  }
  if (/вызывает отец/i.test(situation)) {
    return 'отец. Имени в билете нет, не выдумывай';
  }
  if (/вызывает себе/i.test(situation)) {
    return 'звонит о себе';
  }
  if (/звонит сама/i.test(situation)) {
    return 'звонит сама';
  }
  if (/подруга/i.test(situation)) {
    return 'подруга';
  }
  if (/соседка/i.test(situation)) {
    return 'соседка';
  }
  if (/бабушка/i.test(situation)) {
    return 'бабушка';
  }
  if (/, дочь|дочь,/i.test(situation)) {
    return 'дочь';
  }
  return undefined;
}

function extractInjuredName(situation: string): string | undefined {
  const match =
    situation.match(/ребенок[^.]{0,48}?([А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?(?:\s+[А-ЯЁ][а-яё]+)+)/i) ||
    situation.match(/([А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?(?:\s+[А-ЯЁ][а-яё]+)+)\s+упал/i);
  return match?.[1]?.trim();
}

function openingFrom(situation: string): string {
  let text = situation.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  text = text.replace(/а\s*\/\s*д/gi, 'давление');
  text = text.replace(/(?:тел\.?\s*)?(?:\+?7|8)?[\s\-()]*9\d{2}[\s\-()]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}/gi, ' ');
  text = text.replace(/\b\d{10,11}\b/g, ' ');
  text = text.replace(/\([^)]*\)/g, ' ');
  text = text.replace(/д\/р\s*\d{1,2}\.\d{1,2}\.\d{2,4}/gi, ' ');
  text = text.replace(/\.?\s*(вызывает|звонит)\s+[\s\S]*$/i, '');
  text = text.replace(
    /(?<!^)(?<![.!?]\s)[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?(?:\s+[А-ЯЁ][а-яё]+){1,2}/g,
    ' ',
  );
  const parts = text
    .split(/[,.]/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(
      (part) =>
        part.length > 2 && !OPENING_SKIP.test(part) && !OPENING_FIO.test(part) && !OPENING_SURNAME.test(part),
    );
  let core = '';
  let count = 0;
  for (const part of parts) {
    const next = core ? `${core}, ${part}` : part;
    if (core && next.length > 110) {
      break;
    }
    core = next;
    count += 1;
    if (count >= 2 || core.length >= 80) {
      break;
    }
  }
  core = core.replace(/\s+/g, ' ').trim().replace(/[.!?]+$/g, '').toLocaleLowerCase('ru-RU');
  if (!core) {
    core = 'нужна помощь';
  }
  return `Алло, ${core}, помогите!`;
}

const FEMALE_VOICES: CallerTtsVoice[] = [
  { speaker: 'xenia', pitch: 'high', speed: 1.16, emotion: 'panic', gender: 'female' },
  { speaker: 'xenia', pitch: 'medium', speed: 1.08, emotion: 'scared', gender: 'female' },
  { speaker: 'kseniya', pitch: 'high', speed: 1.14, emotion: 'panic', gender: 'female' },
  { speaker: 'kseniya', pitch: 'low', speed: 1.05, emotion: 'scared', gender: 'female' },
  { speaker: 'baya', pitch: 'medium', speed: 1.12, emotion: 'panic', gender: 'female' },
];

const MALE_VOICES: CallerTtsVoice[] = [
  { speaker: 'eugene', pitch: 'medium', speed: 1.12, emotion: 'panic', gender: 'male' },
  { speaker: 'eugene', pitch: 'low', speed: 1.04, emotion: 'scared', gender: 'male' },
  { speaker: 'aidar', pitch: 'medium', speed: 1.1, emotion: 'panic', gender: 'male' },
  { speaker: 'aidar', pitch: 'low', speed: 1.02, emotion: 'scared', gender: 'male' },
  { speaker: 'eugene', pitch: 'high', speed: 1.18, emotion: 'panic', gender: 'male' },
];

function genderFromFio(full: string): CallerTtsVoice['gender'] | undefined {
  const parts = full.trim().split(/\s+/);
  const surname = parts[0] || '';
  const patronymic = parts[parts.length - 1] || '';
  if (/вна$|чна$/.test(patronymic)) {
    return 'female';
  }
  if (/вич$|ьич$/.test(patronymic) || (/ич$/.test(patronymic) && !/вич$|вна$/.test(patronymic) && parts.length > 1)) {
    return 'male';
  }
  if (/ова$|ева$|ёва$|ина$|ына$|ая$|ская$|цкая$/.test(surname)) {
    return 'female';
  }
  if (/ов$|ев$|ёв$|ин$|ын$|ский$|цкий$/.test(surname)) {
    return 'male';
  }
  return undefined;
}

function inferCallerGender(situation: string, ticket: number, n: number): CallerTtsVoice['gender'] {
  if (/вызывает мама|звонит мама|подруга|соседка|бабушка|, дочь|дочь,|звонит сама/i.test(situation)) {
    return 'female';
  }
  if (/рожает жена|вызывает супруг|вызывает отец/i.test(situation)) {
    return 'male';
  }
  const names = situation.match(/[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?\s+[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+/g) || [];
  for (let i = names.length - 1; i >= 0; i -= 1) {
    const gender = genderFromFio(names[i]);
    if (gender) {
      return gender;
    }
  }
  if (/(прохожий|очевидец|работник|посетитель)/i.test(situation)) {
    return 'male';
  }
  return (ticket * 3 + n) % 2 === 0 ? 'female' : 'male';
}

function pickCallerVoice(ticket: number, n: number, situation: string): CallerTtsVoice {
  const gender = inferCallerGender(situation, ticket, n);
  const pool = gender === 'female' ? FEMALE_VOICES : MALE_VOICES;
  return pool[(ticket * 3 + n) % pool.length];
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
    ttsVoice: pickCallerVoice(ticket.ticket, ticket.n, ticket.situation),
    cardFields: CARD_FIELDS,
    ticketNo: ticket.ticket,
    situationNo: ticket.n,
    address: ticket.address,
    situation: ticket.situation,
    classifierNumber: classifierNumberFor(services, blob),
  };
}

export const AGS_SCENARIOS: TrainingScenario[] = AGS_TICKETS.map(ticketToScenario);

function speakablePlace(text: string): string {
  return text
    .replace(/(?<=[оыи]й)\s*обл\./gi, ' области')
    .replace(/\bобл\./gi, 'область')
    .replace(/\bгор\.\s*(?=[А-ЯЁа-яё])/gi, 'город ')
    .replace(/(^|[\s,;:])г\.\s*(?=[А-ЯЁа-яё])/gi, '$1город ')
    .replace(/\bпос\./gi, 'посёлок')
    .replace(/\bдер\./gi, 'деревня')
    .replace(/\bр-на\b/gi, 'района')
    .replace(/\bр-н\b/gi, 'район')
    .replace(/\bул\./gi, 'улица')
    .replace(/\bпросп\./gi, 'проспект')
    .replace(/\bпр-т\.?/gi, 'проспект')
    .replace(/\bпер\./gi, 'переулок')
    .replace(/\bнаб\./gi, 'набережная')
    .replace(/\bш\.(?=\s|$|,)/gi, 'шоссе')
    .replace(/\bмкр\.?/gi, 'микрорайон')
    .replace(/\bкорп\.?/gi, 'корпус')
    .replace(/\bкв\./gi, 'квартира')
    .replace(/(^|\s)д\.(?=\s*\d)/gi, '$1дом ')
    .replace(/\bстр\.?/gi, 'строение')
    .replace(/\bст\.(?=\s|$|\d)/gi, 'станция')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildLessonSystemPrompt(scenario: TrainingScenario, section: LessonSection): string {
  const situation = speakablePlace(scenario.situation ?? scenario.summary);
  const address = speakablePlace(scenario.address ?? '');
  const ticketLabel =
    scenario.ticketNo && scenario.situationNo
      ? `Билет ${scenario.ticketNo}, ситуация ${scenario.situationNo}`
      : scenario.code;
  const phone = extractPhone(`${situation} ${address}`);
  const caller = extractCallerHint(situation);
  const injured = extractInjuredName(situation);
  const facts = [
    ticketLabel,
    `ЧТО СЛУЧИЛОСЬ: ${situation}`,
    address ? `АДРЕС (назови, только если спросили): ${address}` : '',
    caller ? `КТО ЗВОНИТ: ${caller}` : '',
    injured
      ? `ПОСТРАДАВШИЙ (это не ты; назови только если спросили кто упал / как зовут ребёнка): ${injured}`
      : '',
    phone ? `ТЕЛЕФОН (назови, только если спросили): ${phone}` : '',
    'Чего нет в этих строках — не существует. Не додумывай улицы, этажи, имена, телефоны, службы и цифры.',
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
    `Уже сказано: «${scenario.callerOpening}». Не повторяй эту фразу.`,
    'Имена — только из строк выше. Нет имени заявителя: не выдумывай Свету и любые ФИО. Как вас зовут → «я мама» / «не знаю, как записать». Как давно: если времени нет — «Только что». Если оператор не спрашивает факт, а говорит что услышал или направит помощь — «хорошо» или «жду». Не говори «не вижу» и «не слышу». Не коверкай слова. Слова полностью, без сокращений.',
  ]
    .filter(Boolean)
    .join('\n');
}
