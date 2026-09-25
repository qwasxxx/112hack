import type { CallerTtsVoice, LessonSection, ServiceKind, TrainingScenario } from './scenarios';
import tickets from './ags-tickets.json';
import { coachPromptLine } from '../progress/coach-notes';

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

export function isStreetLighting(text: string): boolean {
  const t = text.toLowerCase();
  return /уличн[а-яё]*\s+освещен|горит\s+уличн/.test(t);
}

function isActualFire(text: string): boolean {
  const t = text.toLowerCase();
  if (isStreetLighting(t)) {
    return false;
  }
  return /пожар|задымл|возгоран|открыт\w*\s+плам|столб черного|что горит не знает|мусоропровод|сигнализац/.test(t) || /горит/.test(t);
}

export function inferServices(text: string): ServiceKind[] {
  const t = text.toLowerCase();
  if (isStreetLighting(t)) {
    return [];
  }
  const out: ServiceKind[] = [];
  if (/запах газа|газовой труб|свист от газов|газ магистральн|на вводе в дом/.test(t) || /(?:^|[^а-яё])газ(?:[^а-яё]|$)/.test(t)) {
    out.push('gas');
  }
  if (isActualFire(t)) {
    out.push('fire');
  }
  const noInjured = /пострадавших нет|пострадавших не вид|пострадавших людей нет|о пострадавших.{0,24}нет|б\/п/.test(t);
  if (
    !noInjured &&
    (/пострадал|сознан|кров|упал|ожог|астма|судорог|тонет|утоп|нож|травм|головн|отёк|отек|рожает|беремен|отошли воды|задыха|нырнул|хрип|снотворн|пена изо рта|перекошен|рвота|топор|сердц|плохо|кричат о помощи/.test(
      t,
    ) ||
      (/дтп/.test(t) && /пострадав/.test(t)) ||
      /\d+\s*пострадав/.test(t))
  ) {
    out.push('ambulance');
  }
  if (
    /дерут|оруж|полиц|угрож|изнасило|угн|завладен|подозрительн|драк|скандал|ссоря|ссора|избит|затащил|повесит|взрыв|тикает|коробка|нетрезв|попрошайн|потерял.*ребен|ребенок 4 года один|угон|похищ|труп|хулиган|мегафон|музык/.test(
      t,
    ) ||
    /дтп/.test(t) ||
    /наезд/.test(t) ||
    /заблокирован|упало бревно/.test(t)
  ) {
    out.push('police');
  }
  if (/течет бензин/.test(t) && !out.includes('fire')) {
    out.push('fire');
  }
  if (!out.length) {
    out.push('police');
  }
  return unique(out);
}

export function classifierNumberFor(services: ServiceKind[], text: string, address = ''): string {
  const t = text.toLowerCase();
  const loc = `${text} ${address}`.toLowerCase();
  if (isStreetLighting(t)) {
    return '14030203';
  }
  if (/дтп/.test(t) && /драк/.test(t)) {
    return /пострадав|кров/.test(t) && !/б\/п|без пострадав/.test(t) ? '2020800' : '2010600';
  }
  if (/дтп/.test(t) && /течет бензин|разлив/.test(t)) {
    return '2020900';
  }
  if (/дтп/.test(t) && /троллейбус|автобус/.test(t) && /пострадав/.test(t)) {
    return '2020500';
  }
  if (/наезд на пешехода/.test(t) && /скрыл/.test(t)) {
    return '2020200';
  }
  if (/наезд на пешехода/.test(t)) {
    return '2020100';
  }
  if (/дтп/.test(t) && (/б\/п/.test(t) || /без пострадав/.test(t))) {
    return '2010000';
  }
  if (/дтп/.test(t) && /пострадав/.test(t)) {
    return '2020000';
  }
  if (/упало бревно|заблокирован/.test(t)) {
    return '2021700';
  }
  if (/падение автомашины в воду/.test(t)) {
    return '17070700';
  }
  if (/контейнер|мусорного контейнера/.test(t) && isActualFire(t)) {
    return '1010101';
  }
  if (/мусоропровод/.test(t)) {
    return /задымл/.test(t) ? '1050602' : '1050601';
  }
  if (/крыш.*частн|частного дома/.test(t) && isActualFire(t)) {
    return '1050901';
  }
  if (/балкон/.test(t) && isActualFire(t)) {
    return '1050201';
  }
  if (/сигнализац/.test(t) && /дыма и возгорания нет|возгорания нет/.test(t)) {
    return '1051600';
  }
  if (/поле/.test(t) && isActualFire(t)) {
    return '1010201';
  }
  if (/а\/м|автомашин|фольксваген|тойота/.test(t) && isActualFire(t) && !/дтп/.test(t)) {
    return '1020201';
  }
  if (/автобус|кабина автобуса/.test(t) && isActualFire(t)) {
    return '1020101';
  }
  if (/столб черного|жилых домов/.test(t) && isActualFire(t)) {
    return '1050001';
  }
  if (/(касс|вокзал|ж\/д станц)/.test(t) && isActualFire(t) && !/метро/.test(t)) {
    return '1020801';
  }
  if (/метро/.test(loc) && /задымл|пожар|горит|платформ/.test(t) && !/торгов|тц\b|ресторан/.test(t)) {
    return '1030002';
  }
  if (/(ресторан|торгов|тц\b|магазин)/.test(t) && /задымл|пожар/.test(t)) {
    return '1060402';
  }
  if (/азс/.test(t) && isActualFire(t)) {
    return '1010201';
  }
  if (/дерев|парк/.test(t) && isActualFire(t)) {
    return /лес/.test(t) ? '1010501' : '1011201';
  }
  if (/лес/.test(t) && isActualFire(t)) {
    return '1010501';
  }
  if (/трав|поле/.test(t) && isActualFire(t)) {
    return '1010201';
  }
  if (/жилых домов|жилом доме/.test(t) && isActualFire(t) && !/квартир|балкон|мусоропровод/.test(t)) {
    return '1050001';
  }
  if (/окно/.test(t) && /этаж/.test(t) && isActualFire(t)) {
    return '1050101';
  }
  if (isActualFire(t) && /квартир/.test(t)) {
    return '1050101';
  }
  if (isActualFire(t) && !/что горит не знает/.test(t)) {
    return '1061601';
  }
  if (isActualFire(t)) {
    return '1010101';
  }
  if (/дерут/.test(t)) {
    if (/10-15|палками|прутами/.test(t)) {
      return '15060202';
    }
    return /квартир/.test(t) ? '15060100' : '15060201';
  }
  if (/тонет человек|тонет человек в настоящее/.test(t)) {
    return '17070200';
  }
  if (/льдин/.test(t)) {
    return '17070100';
  }
  if (/упал с моста в воду|прыгн.*мост/.test(t)) {
    return '17070400';
  }
  if (/заблудил/.test(t) && /лес|деревн|гриб/.test(loc)) {
    return '17020103';
  }
  if (/потерял.*ребен|потерялся ребенок/.test(t)) {
    return '18070000';
  }
  if (/ребенок 4 года один в а\/м|двери заблокировались/.test(t)) {
    return '18080000';
  }
  if (/угон|завладен/.test(t)) {
    return '15210101';
  }
  if (/затащили жену|похищ/.test(t)) {
    return '17030100';
  }
  if (/повесит|суицид/.test(t)) {
    return '17100900';
  }
  if (/взорвать квартир/.test(t)) {
    return '4150000';
  }
  if (/тикает|коробка с проводами|подозрительн.*предмет/.test(t)) {
    return '15130600';
  }
  if (/подозрительн.*автомобил|ваз2110 черная/.test(t)) {
    return '15130700';
  }
  if (/открыть дверь в квартиру/.test(t)) {
    return '20010200';
  }
  if (/громко играет музыка|мегафон/.test(t)) {
    return '15100100';
  }
  if (/ссора во дворе|скандал/.test(t)) {
    return '15190000';
  }
  if (/нетрезв/.test(t)) {
    return '15220000';
  }
  if (/электричк|поездная/.test(t)) {
    return '17050100';
  }
  if (/запах газа|свист от газов/.test(t) && /квартир|кухн/.test(t)) {
    return '13020201';
  }
  if (/запах газа|газ магистральн/.test(t)) {
    return '13010400';
  }
  if (/трещин|отлетела плитк/.test(t)) {
    return '6060100';
  }
  if (/крепления на табло|угроза падения/.test(t)) {
    return '14090504';
  }
  if (/без сознания|потеря сознания|теряет сознание|не может разбудить/.test(t)) {
    return '22020000';
  }
  if (/рожает|отошли воды|беремен/.test(t)) {
    return '22030000';
  }
  if (/избит|в крови|нож|изнасило|окровавлен/.test(t)) {
    return '17010300';
  }
  if (
    /упал|травм|отек|отёк|велосипед|перелом|ушибли|головн|астма|судорог|кровоточ|укусила/.test(t) ||
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
  if (isStreetLighting(t)) {
    return 'Уличное освещение';
  }
  if (/тонет|льдин|в воду|пруд|озер/.test(t)) {
    return 'Происшествие на воде';
  }
  if (/дтп|наезд/.test(t)) {
    return 'ДТП';
  }
  if (services.includes('gas') || /запах газа|газовой труб|свист от газов/.test(t)) {
    return 'Газ';
  }
  if (isActualFire(t)) {
    if (/мусоропровод/.test(t)) {
      return 'Задымление мусоропровода';
    }
    if (/контейнер|мусор/.test(t)) {
      return 'Возгорание мусора';
    }
    if (/а\/м|автомашин|автобус/.test(t)) {
      return 'Горит транспорт';
    }
    if (/лес|трав|поле|дерев/.test(t)) {
      return 'Природный пожар';
    }
    if (/задымл/.test(t)) {
      return 'Задымление';
    }
    if (/сигнализац/.test(t) && /нет/.test(t)) {
      return 'Пожарная сигнализация';
    }
    return 'Пожар / задымление';
  }
  if (/потерял.*ребен|заблудил|не вернул|потер.*памят/.test(t)) {
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

function nameCoach(caller: string | undefined): string {
  if (caller?.startsWith('мама')) {
    return 'Если спросили как зовут — не говори «Я мама». Назови имя из фактов билета, если оно есть, иначе коротко «Не знаю».';
  }
  if (caller?.startsWith('отец') || caller?.startsWith('супруг')) {
    return 'Если спросили как зовут — коротко «Я отец» или «Я муж». Не объясняй, что имени нет.';
  }
  if (caller && /[А-ЯЁ][а-яё]+/.test(caller)) {
    return `Если спросили кто вы или как зовут — только «Я ${caller}».`;
  }
  return 'Если спросили как зовут и имени в билете нет — коротко «Не знаю». Не объясняй, почему имени нет.';
}

function extractCallerHint(situation: string): string | undefined {
  const names = situation.match(/[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?(?:\s+[А-ЯЁ][а-яё]+){1,2}/g);
  const fio = names?.filter((item) => !/^Москва$|^Россия$/.test(item)).at(-1)?.trim();
  if (fio) {
    return fio;
  }
  if (/вызывает мама|звонит мама/i.test(situation)) {
    return 'мама. Имени заявителя в билете нет — не выдумывай Свету, Марию и любые другие имена. Если спросили как зовут: «не знаю»';
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

export function situationWhat(situation: string): string {
  if (isStreetLighting(situation)) {
    return 'Горит уличное освещение на МКАД — фонари светят. Это не пожар и не квартира.';
  }
  let text = situation.replace(/\u00a0/g, ' ');
  text = text.replace(/(?:тел\.?\s*)?(?:\+?7|8)?[\s\-()]*9\d{2}[\s\-()]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}/gi, ' ');
  text = text.replace(/\b\d{10,11}\b/g, ' ');
  text = text.replace(/\([^)]*\)/g, ' ');
  text = text.replace(/(?<!^)(?<![.!?]\s)[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?(?:\s+[А-ЯЁ][а-яё]+){1,2}/g, ' ');
  text = text
    .replace(/\s+/g, ' ')
    .replace(/^[,.\s]+|[,.\s]+$/g, '')
    .trim();
  const first = text.split(/[.!]/)[0]?.trim() || text;
  return first.slice(0, 180);
}

function promptForbidden(situation: string, address: string, services: ServiceKind[]): string {
  const blob = `${situation} ${address}`.toLowerCase();
  const bans: string[] = [];
  if (isStreetLighting(blob)) {
    bans.push(
      'Это НЕ пожар и НЕ квартира. Горят фонари (свет включён). Не говори «пожар», «пламя», «дым», «этаж», «подъезд», «в квартире».',
    );
  }
  if (!/кв\.|квартир/.test(blob)) {
    bans.push('Квартиры в билете нет — не называй квартиру, если её нет в адресе.');
  }
  if (!isActualFire(blob) && !services.includes('fire')) {
    bans.push('Пожара нет.');
  }
  if (/пострадавших нет|б\/п|без пострадавших/.test(blob)) {
    bans.push('Пострадавших нет — не выдумывай раненых.');
  }
  if (!/\d+\s*этаж|эт\./.test(blob)) {
    bans.push('Этажа в билете нет — не выдумывай этаж.');
  }
  return bans.filter(Boolean).join(' ');
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
  const hint = extractCallerHint(situation) ?? '';
  if (/^(мама|подруга|соседка|бабушка|дочь)/i.test(hint)) {
    return 'female';
  }
  if (/^(отец|супруг)/i.test(hint)) {
    return 'male';
  }
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

function callerEmotion(situation: string): CallerTtsVoice['emotion'] {
  if (/пожар|взрыв|горит|пламя|газ|задых|без сознан|не могу дышать|умира|зажат|оруж/i.test(situation)) {
    return 'panic';
  }
  return 'scared';
}

function pickCallerVoice(ticket: number, n: number, situation: string): CallerTtsVoice {
  const gender = inferCallerGender(situation, ticket, n);
  const pool = gender === 'female' ? FEMALE_VOICES : MALE_VOICES;
  const voice = pool[(ticket * 3 + n) % pool.length];
  return { ...voice, emotion: callerEmotion(situation), speed: voice.speed > 1.08 ? 1.05 : voice.speed };
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
  if (services.includes('fire') && !/уличн[а-яё]*\s+освещен/.test(t)) {
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
  const services = inferServices(ticket.situation);
  const difficulty = assessDifficulty(ticket.situation, ticket.address);
  const theme = publicTheme(ticket.situation, services);
  const id = `ags-${String(ticket.ticket).padStart(2, '0')}-${ticket.n}`;
  const blob = `${ticket.situation} ${ticket.address}`;
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
    classifierNumber: classifierNumberFor(services, ticket.situation, ticket.address),
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
  const what = situationWhat(situation);
  const forbidden = promptForbidden(situation, address, scenario.services);
  const serviceLine = scenario.services.length
    ? `СЛУЖБЫ ПО БИЛЕТУ: ${scenario.services.map((item) => ({ fire: 'пожарные', ambulance: 'скорая', police: 'полиция', gas: 'газ' })[item]).join(', ')}`
    : 'СЛУЖБЫ ПО БИЛЕТУ: не пожарные. Это не вызов МЧС по пожару.';
  const facts = [
    ticketLabel,
    `ЧТО СЛУЧИЛОСЬ: ${what}`,
    `ФАКТЫ БИЛЕТА ЦЕЛИКОМ: ${situation}`,
    address ? `АДРЕС (назови, только если спросили): ${address}` : '',
    caller ? `КТО ЗВОНИТ: ${caller}` : '',
    injured
      ? `ПОСТРАДАВШИЙ (это не ты; назови только если спросили кто упал / как зовут ребёнка): ${injured}`
      : '',
    phone ? `ТЕЛЕФОН (назови, только если спросили): ${phone}` : '',
    serviceLine,
    forbidden ? `ЗАПРЕЩЕНО: ${forbidden}` : '',
    'Чего нет в этих строках — не существует. Не додумывай улицы, этажи, квартиры, пожары, имена, телефоны, службы и цифры.',
    coachPromptLine(scenario.id),
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
    `Имена — только из строк выше. ${nameCoach(caller)} Как давно: если времени нет — «Только что». Если оператор не спрашивает факт, а говорит что услышал или направит помощь — «хорошо» или «жду». Не говори «не вижу», «не слышу», «не за что» и «я слушаю». Не коверкай слова. Слова полностью, без сокращений.`,
  ]
    .filter(Boolean)
    .join('\n');
}
