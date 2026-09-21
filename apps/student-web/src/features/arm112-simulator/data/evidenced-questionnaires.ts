/**
 * Questionnaire (опросная карта) fields that appear on screenshots.
 * Do not invent additional questions: only labels/options actually visible.
 */

export type EvidencedOptionChip = {
  label: string;
  selectedInScreenshot?: boolean;
};

export type EvidencedQuestionControl = 'chips' | 'chips-exclusive' | 'yes-no' | 'yes-no-unknown' | 'text' | 'free-text-line';

export type EvidencedShowWhen = {
  question: string;
  anyOf: string[];
};

export type EvidencedQuestion = {
  label: string;
  control: EvidencedQuestionControl;
  options?: EvidencedOptionChip[];
  source: string;
  showWhen?: EvidencedShowWhen[];
  showWhenAny?: EvidencedShowWhen[];
};

export type EvidencedQuestionnaire = {
  title: string;
  source: string;
  questions: EvidencedQuestion[];
};

const street = (extra: EvidencedShowWhen[] = []): EvidencedShowWhen[] => [{ question: 'Где', anyOf: ['Улица'] }, ...extra];
const transport = (extra: EvidencedShowWhen[] = []): EvidencedShowWhen[] => [{ question: 'Где', anyOf: ['Транспорт'] }, ...extra];
const house = (extra: EvidencedShowWhen[] = []): EvidencedShowWhen[] => [{ question: 'Где', anyOf: ['Дом'] }, ...extra];

export const EVIDENCED_QUESTIONNAIRES: EvidencedQuestionnaire[] = [
  {
    title: 'Происшествие 101',
    source: 'КАРТОЧКА 112.docx image14–39 + house path from СКРИНШОТ КАРТОЧКИ 112ГСИ',
    questions: [
      {
        label: 'Где',
        control: 'chips-exclusive',
        options: [
          { label: 'Улица' },
          { label: 'Транспорт' },
          { label: 'Дом' },
          { label: 'Здание / объект' },
          { label: 'Опасный объект' },
        ],
        source: 'КАРТОЧКА 112.docx image14',
      },
      {
        label: 'Признак пожара (улица)',
        control: 'chips-exclusive',
        options: [{ label: 'Открытое пламя / Дым' }, { label: 'Запах гари' }],
        source: 'КАРТОЧКА 112.docx image15',
        showWhen: street(),
      },
      {
        label: 'Признак пожара (транспорт)',
        control: 'chips-exclusive',
        options: [{ label: 'Открытое пламя / Дым' }, { label: 'Сработала пожарная сигнализация' }],
        source: 'КАРТОЧКА 112.docx image33',
        showWhen: transport(),
      },
      {
        label: 'Признак пожара (дом)',
        control: 'chips-exclusive',
        options: [
          { label: 'Открытое пламя / Дым' },
          { label: 'Запах гари' },
          { label: 'Сработала пожарная сигнализация' },
        ],
        source: 'СКРИНШОТ КАРТОЧКИ 112ГСИ image2',
        showWhen: house(),
      },
      {
        label: 'Доступ',
        control: 'chips',
        options: [{ label: 'Нет доступа' }],
        source: 'КАРТОЧКА 112.docx image15',
        showWhen: [{ question: 'Где', anyOf: ['Улица', 'Транспорт', 'Дом'] }],
      },
      {
        label: 'Улица (пламя, дым)',
        control: 'chips',
        options: [
          { label: 'Мусор' },
          { label: 'Трава, пух' },
          { label: 'Парк' },
          { label: 'Лес' },
          { label: 'Торф' },
          { label: 'Мачта освещения' },
          { label: 'Опора контактной сети' },
          { label: 'ЛЭП' },
          { label: 'Провода' },
          { label: 'Дерево, деревья' },
          { label: 'Горит человек' },
          { label: 'Что горит неизвестно' },
        ],
        source: 'КАРТОЧКА 112.docx image16',
        showWhen: street([{ question: 'Признак пожара (улица)', anyOf: ['Открытое пламя / Дым'] }]),
      },
      {
        label: 'Место происшествия',
        control: 'chips-exclusive',
        options: [{ label: 'Тоннель' }, { label: 'Пешеходный переход' }],
        source: 'КАРТОЧКА 112.docx image15',
        showWhen: street(),
      },
      {
        label: 'Транспорт (пламя, дым)',
        control: 'chips',
        options: [
          { label: 'Общественный транспорт' },
          { label: 'Автомашина' },
          { label: 'ДТП с пожаром' },
          { label: 'Опасный груз' },
          { label: 'Воздушный транспорт' },
          { label: 'Аэропорт' },
          { label: 'Ж/Д транспорт' },
          { label: 'Вокзал Ж/Д, платформа Ж/Д' },
          { label: 'Транспорт прочее' },
          { label: 'Водный' },
          { label: 'Мост' },
          { label: 'Эстакада' },
          { label: 'Тоннель' },
          { label: 'Переход подземный/наземный' },
          { label: 'Метро' },
          { label: 'МЦК, МЦД' },
          { label: 'Ж/Д пути' },
          { label: 'Релейный шкаф Ж/Д' },
        ],
        source: 'КАРТОЧКА 112.docx image34',
        showWhen: transport([{ question: 'Признак пожара (транспорт)', anyOf: ['Открытое пламя / Дым'] }]),
      },
      {
        label: 'Дом (пламя, дым)',
        control: 'chips',
        options: [
          { label: 'Дом многоквартирный' },
          { label: 'Дом частный' },
          { label: 'Дача' },
          { label: 'Сарай / бытовка / хоз. постройка' },
          { label: 'Выселенное здание' },
        ],
        source: 'СКРИНШОТ КАРТОЧКИ 112ГСИ image2',
        showWhen: house([{ question: 'Признак пожара (дом)', anyOf: ['Открытое пламя / Дым'] }]),
      },
      {
        label: 'Этажность здания',
        control: 'free-text-line',
        source: 'СКРИНШОТ КАРТОЧКИ 112ГСИ image2',
        showWhen: house([{ question: 'Признак пожара (дом)', anyOf: ['Открытое пламя / Дым'] }]),
      },
      {
        label: 'Внутридомовые объекты (пламя/дым)',
        control: 'chips',
        options: [
          { label: 'Квартира' },
          { label: 'Балкон' },
          { label: 'Газовая колонка' },
          { label: 'Газовая плита' },
          { label: 'Лифт' },
          { label: 'Мусоропровод' },
          { label: 'Подъезд' },
          { label: 'Счетчик электричества' },
          { label: 'Электрическая проводка' },
          { label: 'Электрощит' },
          { label: 'Лестничная клетка' },
          { label: 'Подвал' },
          { label: 'Прочие внутридомовые объекты' },
          { label: 'Крыша' },
        ],
        source: 'СКРИНШОТ КАРТОЧКИ 112ГСИ image2',
        showWhen: house([{ question: 'Признак пожара (дом)', anyOf: ['Открытое пламя / Дым'] }]),
      },
      {
        label: 'Есть ли перекрытие движения',
        control: 'yes-no',
        options: [{ label: 'Да' }, { label: 'Нет' }],
        source: 'СКРИНШОТ КАРТОЧКИ 112ГСИ image2',
        showWhen: house([{ question: 'Признак пожара (дом)', anyOf: ['Открытое пламя / Дым'] }]),
      },
      {
        label: 'Угроза людям',
        control: 'yes-no',
        options: [{ label: 'Да' }, { label: 'Нет' }],
        source: 'КАРТОЧКА 112.docx image16 / image34',
        showWhenAny: [
          { question: 'Признак пожара (улица)', anyOf: ['Открытое пламя / Дым'] },
          { question: 'Признак пожара (транспорт)', anyOf: ['Открытое пламя / Дым'] },
          { question: 'Признак пожара (дом)', anyOf: ['Открытое пламя / Дым'] },
        ],
      },
      {
        label: 'Правонарушение',
        control: 'chips',
        options: [{ label: 'Есть правонарушение' }],
        source: 'КАРТОЧКА 112.docx image19',
        showWhen: street([{ question: 'Улица (пламя, дым)', anyOf: ['Мусор'] }]),
      },
      {
        label: 'Описание правонарушения',
        control: 'free-text-line',
        source: 'КАРТОЧКА 112.docx image24',
        showWhen: [{ question: 'Правонарушение', anyOf: ['Есть правонарушение'] }],
      },
      {
        label: 'Медицинская помощь',
        control: 'yes-no',
        options: [{ label: 'Да' }, { label: 'Нет' }],
        source: 'КАРТОЧКА 112.docx image16 / image34',
        showWhenAny: [
          { question: 'Признак пожара (улица)', anyOf: ['Открытое пламя / Дым'] },
          { question: 'Признак пожара (транспорт)', anyOf: ['Открытое пламя / Дым'] },
        ],
      },
      {
        label: 'Требуется эвакуация',
        control: 'yes-no',
        options: [{ label: 'Да' }, { label: 'Нет' }],
        source: 'КАРТОЧКА 112.docx image16 / image34',
        showWhenAny: [
          { question: 'Признак пожара (улица)', anyOf: ['Открытое пламя / Дым'] },
          { question: 'Признак пожара (транспорт)', anyOf: ['Открытое пламя / Дым'] },
        ],
      },
      {
        label: 'Проведена ли газификация',
        control: 'yes-no-unknown',
        options: [{ label: 'Да' }, { label: 'Нет' }, { label: 'Нет данных' }],
        source: 'КАРТОЧКА 112.docx image16',
        showWhen: street([{ question: 'Признак пожара (улица)', anyOf: ['Открытое пламя / Дым'] }]),
      },
      {
        label: 'Описание',
        control: 'free-text-line',
        source: 'КАРТОЧКА 112.docx image14',
      },
    ],
  },
  {
    title: 'Происшествие 104',
    source: 'СКРИНШОТ КАРТОЧКИ 112ГСИ.docx image7',
    questions: [
      {
        label: 'Признаки происшествия',
        control: 'chips',
        options: [
          { label: 'Запах газа вне помещения (на улице)' },
          { label: 'Запах газа в помещении (в квартире, в доме)' },
          { label: 'Нарушение в работе газового оборудования' },
          { label: 'Повреждение газопровода' },
          { label: 'Повышенное давление газа' },
        ],
        source: 'card-screens image7',
      },
      {
        label: 'Угроза людям',
        control: 'yes-no',
        options: [{ label: 'Да' }, { label: 'Нет' }],
        source: 'card-screens image7',
      },
    ],
  },
  {
    title: 'П: Взрыв',
    source: 'СКРИНШОТ КАРТОЧКИ 112ГСИ.docx image9',
    questions: [
      {
        label: 'Где взрыв',
        control: 'chips',
        options: [
          { label: 'Здание / Объект' },
          { label: 'Транспорт' },
          { label: 'Звуки похожие на взрыв, что взорвалось сообщить не может' },
        ],
        source: 'card-screens image9',
      },
      {
        label: 'Есть возгорание',
        control: 'yes-no',
        options: [{ label: 'Да' }, { label: 'Нет' }],
        source: 'card-screens image9',
      },
      {
        label: 'Есть угроза обрушения',
        control: 'yes-no',
        options: [{ label: 'Да' }, { label: 'Нет' }],
        source: 'card-screens image9',
      },
      {
        label: 'Какие видят разрушения',
        control: 'free-text-line',
        source: 'card-screens image9',
      },
    ],
  },
  {
    title: 'Происшествие 103',
    source: 'Инструкция_по_заведению_карточки_2507ГСИ.docx image18',
    questions: [
      {
        label: '',
        control: 'chips',
        options: [
          { label: 'Поликлиника' },
          { label: 'Войсковая часть (ВЧ)' },
          { label: 'Учебные учреждения' },
          { label: 'Общежитие' },
          { label: 'Дача (СНТ)' },
          { label: 'Прочие' },
        ],
        source: 'card-manual image18 (row of chips without a visible group label)',
      },
      { label: 'Фамилия', control: 'free-text-line', source: 'card-manual image18' },
      { label: 'Имя', control: 'free-text-line', source: 'card-manual image18' },
      { label: 'Отчество', control: 'free-text-line', source: 'card-manual image18' },
      { label: 'Дата рождения', control: 'free-text-line', source: 'card-manual image18' },
      { label: 'Возраст', control: 'free-text-line', source: 'card-manual image18' },
      {
        label: 'Пол',
        control: 'chips',
        options: [{ label: 'Мужчина' }, { label: 'Женщина' }],
        source: 'card-manual image18',
      },
      {
        label: 'Отказ',
        control: 'chips',
        options: [{ label: 'Отказ от реагирования Скорой' }],
        source: 'card-manual image18 / card-manual §4.2 «Отказ от реагирования»',
      },
      {
        label: 'Угроза людям',
        control: 'yes-no',
        options: [{ label: 'Да' }, { label: 'Нет' }],
        source: 'card-manual image18',
      },
      {
        label: 'Медицинская помощь',
        control: 'yes-no',
        options: [{ label: 'Да' }, { label: 'Нет' }],
        source: 'card-manual image18',
      },
      {
        label: 'Требуется эвакуация',
        control: 'yes-no',
        options: [{ label: 'Да' }, { label: 'Нет' }],
        source: 'card-manual image18',
      },
    ],
  },
];

/** Frequent-type chips on empty «ЧТО СЛУЧИЛОСЬ?» (КАРТОЧКА 112.docx image1). */
export const EVIDENCED_WHAT_HAPPENED_CHIPS = [
  'Отмена вызова',
  'Тестовый вызов',
  'Передача дежурства',
  'ДТП',
  'Консультация',
  'Вызов на иностранном языке',
  'Ошибочно набран номер',
  'Справка-101',
  'Справка-102',
  'Справка-103',
] as const;

/** Full type dropdown from КАРТОЧКА 112.docx image2–13, screenshot spellings. */
export const EVIDENCED_WHAT_HAPPENED_SEARCH_HITS = [
  '101',
  '102',
  '103',
  '104',
  'Аварии и происшествия в городском хозяйстве',
  'Аварии и происшествия на транспортных объектах',
  'Аварии на гидротехнических сооружениях',
  'Аварии на опасных и производственных объектах',
  'Благодарность службам',
  'БПЛА',
  'Взрыв',
  'Внутренний звонок (звонок от работников)',
  'Вызов на иностранном языке',
  'Дополнительный звонок от заявителя',
  'Дорожные помехи',
  'ДТП',
  'Жалоба на действие или бездействие служб',
  'Животные',
  'Консультация',
  'Нецелевой вызов',
  'Обрушение',
  'Отзыв о работе 112 Москва',
  'Отмена вызова',
  'Ошибочно набран номер',
  'Передача дежурства',
  'Помощь службам',
  'Природная стихия',
  'Прочие происшествия',
  'Радиация',
  'Разбитый градусник',
  'Ребенок в опасности',
  'Сбор',
  'Скопление воды',
  'Смертельный исход',
  'Социальная помощь',
  'Справка-101',
  'Справка-102',
  'Справка-103',
  'Справка-104',
  'Справка-ГИБДД',
  'Справка Городское Хозяйство',
  'Справка-МЧС',
  'Тестовый вызов',
  'Технический сбой (сбой в работе оборудования 112 Москва)',
  'Тренировка',
  'Уведомление о ЧС',
  'Угроза взрыва/террористического акта',
  'Угроза выброса опасных веществ и радиации',
  'Угроза обрушения',
  'Человек в опасности',
  'Экологические происшествия',
] as const;

/** Heading is on the empty panel; chips are not shown on КАРТОЧКА 112.docx image1. */
export const EVIDENCED_SIGNIFICANT_TYPES = [] as const;

export function answersMap(answers: Array<{ questionLabel: string; values: string[] }> | undefined): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const item of answers ?? []) {
    map.set(item.questionLabel, item.values);
  }
  return map;
}

export function questionIsVisible(
  question: EvidencedQuestion,
  answers: Array<{ questionLabel: string; values: string[] }> | undefined,
): boolean {
  const map = answersMap(answers);
  const match = (rule: EvidencedShowWhen) => {
    const values = map.get(rule.question) ?? [];
    return rule.anyOf.some((item) => values.includes(item));
  };
  if (question.showWhen && question.showWhen.length > 0 && !question.showWhen.every(match)) {
    return false;
  }
  if (question.showWhenAny && question.showWhenAny.length > 0 && !question.showWhenAny.some(match)) {
    return false;
  }
  return true;
}

export function visibleQuestions(
  questionnaire: EvidencedQuestionnaire,
  answers: Array<{ questionLabel: string; values: string[] }> | undefined,
): EvidencedQuestion[] {
  return questionnaire.questions.filter((question) => questionIsVisible(question, answers));
}

export function isExclusiveQuestion(question: EvidencedQuestion): boolean {
  return question.control === 'yes-no' || question.control === 'yes-no-unknown' || question.control === 'chips-exclusive';
}
