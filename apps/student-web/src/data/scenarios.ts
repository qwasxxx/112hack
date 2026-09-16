export type ServiceKind = 'fire' | 'ambulance' | 'police' | 'gas';

export type CardField = {
  key: string;
  label: string;
  type: 'string' | 'text' | 'enum' | 'phone';
  required: boolean;
  options?: string[];
};

export type TrainingScenario = {
  id: string;
  code: string;
  title: string;
  summary: string;
  services: ServiceKind[];
  durationMin: number;
  difficulty: 'базовый' | 'стандарт' | 'сложный';
  theory: string[];
  checklist: string[];
  callerOpening: string;
  conversationRole?: 'victim' | 'operator';
  systemPrompt?: string;
  cardFields: CardField[];
};

export const SERVICE_LABEL: Record<ServiceKind, string> = {
  fire: 'Пожарные',
  ambulance: 'Скорая',
  police: 'Полиция',
  gas: 'Газовая',
};

export const SCENARIOS: TrainingScenario[] = [
  {
    id: 'apartment-fire',
    code: '112-01',
    title: 'Пожар в квартире',
    summary: 'Соседка видит дым из окна напротив и не может дозвониться до жильцов.',
    services: ['fire', 'ambulance'],
    durationMin: 8,
    difficulty: 'стандарт',
    theory: [
      'Сначала представьтесь и зафиксируйте адрес. Без адреса службы не выезжают.',
      'Уточните, что горит, есть ли люди внутри, есть ли угроза соседним квартирам.',
      'Не спорьте с заявителем и не давайте обещаний по времени прибытия.',
    ],
    checklist: [
      'Представиться как оператор 112',
      'Получить точный адрес',
      'Выяснить, есть ли люди в квартире',
      'Заполнить карточку происшествия',
    ],
    callerOpening: 'Алло, у нас пожар, из окна дым валит, скорее приезжайте!',
    conversationRole: 'operator',
    cardFields: [
      { key: 'address', label: 'Адрес', type: 'string', required: true },
      { key: 'what_happened', label: 'Что произошло', type: 'text', required: true },
      { key: 'people', label: 'Люди на месте', type: 'string', required: true },
      {
        key: 'service',
        label: 'Службы',
        type: 'enum',
        required: true,
        options: ['Пожарные', 'Пожарные и скорая', 'Скорая'],
      },
      { key: 'caller_phone', label: 'Телефон заявителя', type: 'phone', required: false },
    ],
  },
  {
    id: 'road-accident',
    code: '112-02',
    title: 'ДТП на перекрёстке',
    summary: 'Столкновение двух машин, заявитель в одной из них, есть пострадавший.',
    services: ['police', 'ambulance'],
    durationMin: 10,
    difficulty: 'стандарт',
    theory: [
      'Для ДТП нужны место, число участников, есть ли пострадавшие и перекрыта ли проезжая часть.',
      'Если есть раненые — приоритет скорой. Полицию направляют параллельно.',
    ],
    checklist: [
      'Зафиксировать место ДТП',
      'Узнать число пострадавших',
      'Уточнить, перекрыта ли дорога',
    ],
    callerOpening: 'Мы столкнулись на перекрёстке, тут человек в машине, он не выходит!',
    conversationRole: 'operator',
    cardFields: [
      { key: 'address', label: 'Место', type: 'string', required: true },
      { key: 'what_happened', label: 'Что произошло', type: 'text', required: true },
      { key: 'injured', label: 'Пострадавшие', type: 'string', required: true },
      {
        key: 'service',
        label: 'Службы',
        type: 'enum',
        required: true,
        options: ['Полиция и скорая', 'Только скорая', 'Только полиция'],
      },
    ],
  },
  {
    id: 'lost-child',
    code: '112-03',
    title: 'Потерявшийся ребёнок',
    summary: 'Мать не может найти сына во дворе, последний раз видела его у площадки.',
    services: ['police'],
    durationMin: 7,
    difficulty: 'базовый',
    theory: [
      'Нужны приметы, одежда, время пропажи и место, где видели в последний раз.',
      'Держите заявителя на линии, пока не собраны основные данные.',
    ],
    checklist: [
      'Имя и возраст ребёнка',
      'Приметы и одежда',
      'Где видели последний раз',
    ],
    callerOpening: 'Я сына потеряла, ему семь лет, он был во дворе и пропал!',
    conversationRole: 'operator',
    cardFields: [
      { key: 'address', label: 'Адрес / район', type: 'string', required: true },
      { key: 'who', label: 'Кого ищут', type: 'string', required: true },
      { key: 'description', label: 'Приметы', type: 'text', required: true },
      { key: 'last_seen', label: 'Где видели последний раз', type: 'string', required: true },
    ],
  },
];

export function getScenario(id: string): TrainingScenario | undefined {
  return SCENARIOS.find((item) => item.id === id);
}
