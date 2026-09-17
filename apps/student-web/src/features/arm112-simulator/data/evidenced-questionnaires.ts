/**
 * Questionnaire (опросная карта) fields that appear on screenshots.
 * Do not invent additional questions: only labels/options actually visible.
 */

export type EvidencedOptionChip = {
  label: string;
  selectedInScreenshot?: boolean;
};

export type EvidencedQuestion = {
  label: string;
  control: 'chips' | 'yes-no' | 'yes-no-unknown' | 'text' | 'free-text-line';
  options?: EvidencedOptionChip[];
  source: string;
};

export type EvidencedQuestionnaire = {
  title: string;
  source: string;
  questions: EvidencedQuestion[];
};

export const EVIDENCED_QUESTIONNAIRES: EvidencedQuestionnaire[] = [
  {
    title: 'Происшествие 101',
    source: 'СКРИНШОТ КАРТОЧКИ 112ГСИ.docx image2/image4, 17.09.2026',
    questions: [
      {
        label: 'Где',
        control: 'chips',
        options: [
          { label: 'Улица' },
          { label: 'Транспорт' },
          { label: 'Дом', selectedInScreenshot: true },
          { label: 'Здание / объект' },
          { label: 'Опасный объект' },
        ],
        source: 'card-screens image2',
      },
      {
        label: 'Признак пожара (дом)',
        control: 'chips',
        options: [
          { label: 'Открытое пламя / Дым', selectedInScreenshot: true },
          { label: 'Запах гари' },
          { label: 'Сработала пожарная сигнализация' },
        ],
        source: 'card-screens image2',
      },
      {
        label: 'Доступ',
        control: 'chips',
        options: [{ label: 'Нет доступа' }],
        source: 'card-screens image2',
      },
      {
        label: 'Дом (пламя, дым)',
        control: 'chips',
        options: [
          { label: 'Дом многоквартирный', selectedInScreenshot: true },
          { label: 'Дом частный' },
          { label: 'Дача' },
          { label: 'Сарай / бытовка / хоз. постройка' },
          { label: 'Выселенное здание' },
        ],
        source: 'card-screens image2',
      },
      {
        label: 'Этажность здания',
        control: 'free-text-line',
        source: 'card-screens image2 (empty underline, no options visible)',
      },
      {
        label: 'Угроза людям',
        control: 'yes-no',
        options: [{ label: 'Да' }, { label: 'Нет' }],
        source: 'card-screens image2',
      },
      {
        label: 'Внутридомовые объекты (пламя/дым)',
        control: 'chips',
        options: [
          { label: 'Квартира', selectedInScreenshot: true },
          { label: 'Балкон' },
          { label: 'Газовая колонка', selectedInScreenshot: true },
          { label: 'Газовая плита' },
          { label: 'Лифт' },
          { label: 'Мусоропровод' },
          { label: 'Подъезд', selectedInScreenshot: true },
          { label: 'Счетчик электричества' },
          { label: 'Электрическая проводка' },
          { label: 'Электрощит' },
          { label: 'Лестничная клетка' },
          { label: 'Подвал' },
          { label: 'Прочие внутридомовые объекты' },
          { label: 'Крыша' },
        ],
        source: 'card-screens image2 / image4',
      },
      {
        label: 'Есть ли перекрытие движения',
        control: 'yes-no',
        options: [{ label: 'Да' }, { label: 'Нет' }],
        source: 'card-screens image2',
      },
      {
        label: 'Проведена ли газификация',
        control: 'yes-no-unknown',
        options: [{ label: 'Да' }, { label: 'Нет' }, { label: 'Нет данных' }],
        source: 'card-screens image2',
      },
      {
        label: 'Описание',
        control: 'text',
        source: 'card-screens image2',
      },
    ],
  },
  {
    title: 'Происшествие 101',
    source: 'Инструкция_по_заведению_карточки_2507ГСИ.docx image46 (улица)',
    questions: [
      {
        label: 'Где',
        control: 'chips',
        options: [
          { label: 'Улица', selectedInScreenshot: true },
          { label: 'Транспорт' },
          { label: 'Дом' },
          { label: 'Здание/объект' },
          { label: 'Опасный объект' },
        ],
        source: 'card-manual image46',
      },
      {
        label: 'Признак пожара (улица)',
        control: 'chips',
        options: [
          { label: 'Дым' },
          { label: 'Открытое пламя', selectedInScreenshot: true },
          { label: 'Запах гари' },
        ],
        source: 'card-manual image46',
      },
      {
        label: 'Доступ',
        control: 'chips',
        options: [{ label: 'Нет доступа' }],
        source: 'card-manual image46',
      },
      {
        label: 'Улица (пламя)',
        control: 'chips',
        options: [
          { label: 'мусор' },
          { label: 'трава' },
          { label: 'пух', selectedInScreenshot: true },
          { label: 'парк' },
          { label: 'лес' },
          { label: 'торф' },
          { label: 'мачта освещения' },
          { label: 'опора контактной сети' },
          { label: 'ЛЭП' },
          { label: 'провода' },
          { label: 'дерево, деревья' },
        ],
        source: 'card-manual image46',
      },
      {
        label: 'Место происшествия',
        control: 'chips',
        options: [{ label: 'Тоннель' }, { label: 'Пешеходный переход' }],
        source: 'card-manual image46',
      },
      {
        label: 'Угроза людям',
        control: 'yes-no',
        options: [{ label: 'Да' }, { label: 'Нет' }],
        source: 'card-manual image46',
      },
      {
        label: 'Правонарушение',
        control: 'chips',
        options: [{ label: 'Есть правонарушение' }],
        source: 'card-manual image46',
      },
      {
        label: 'Медицинская помощь',
        control: 'yes-no',
        options: [{ label: 'Да' }, { label: 'Нет' }],
        source: 'card-manual image46',
      },
      {
        label: 'Требуется эвакуация',
        control: 'yes-no',
        options: [{ label: 'Да' }, { label: 'Нет' }],
        source: 'card-manual image46',
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
        options: [{ label: 'Отказ от реагирования Скорой', selectedInScreenshot: true }],
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

/** Frequent-type chips visible on empty «ЧТО СЛУЧИЛОСЬ?» panel (2026 screenshot). */
export const EVIDENCED_WHAT_HAPPENED_CHIPS = [
  'ДТП',
  'Ошибочно набран номер',
  '104',
  'Человек в опасности',
  'Отмена вызова',
  'Тестовый вызов',
  'Передача дежурства',
  'Консультация',
  'Вызов на иностранном языке',
  'Справка-101',
] as const;

/** Search hits visible under «ЧТО СЛУЧИЛОСЬ?» in screenshots. */
export const EVIDENCED_WHAT_HAPPENED_SEARCH_HITS = [
  '101',
  '102',
  '103',
  '104',
  'Аварии и происшествия в городском хозяйстве',
  'Аварии на гидротехнических сооружениях',
  'Аварии на опасных и производственных объектах',
  'Благодарность службам',
  'ЕПЛА',
  'Взрыв',
] as const;

/** «Значимые типы происшествий» list from instruction screenshot image23. */
export const EVIDENCED_SIGNIFICANT_TYPES = [
  'Аварии и происшествия в городском хозяйстве',
  '103',
  'Экологические происшествия',
  'Аварии и происшествия на транспортных объектах',
] as const;
