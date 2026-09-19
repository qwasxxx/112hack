import { AGS_SCENARIOS } from './ags-tickets';

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
  cardFields: CardField[];
  ticketNo?: number;
  situationNo?: number;
  address?: string;
  situation?: string;
  classifierNumber?: string;
};

export type LessonSection = 'theory' | 'training' | 'exam';

export const SECTION_AI_ROLE: Record<LessonSection, 'victim' | 'operator'> = {
  theory: 'operator',
  training: 'victim',
  exam: 'victim',
};

export const LESSON_SECTIONS: Array<{
  id: LessonSection;
  title: string;
  lead: string;
  youAre: string;
  enabled: boolean;
}> = [
  {
    id: 'theory',
    title: 'Теория',
    lead: 'Ознакомление с АРМ-112: поля карточки, звонок, адрес, службы и действия. Без учебного вызова.',
    youAre: 'Ознакомление с АРМ',
    enabled: true,
  },
  {
    id: 'training',
    title: 'Тренировка',
    lead: 'Вызов, заполнение карточки происшествия, классификатор и службы. Результат — заполненные поля, службы и замечания по обязательным данным.',
    youAre: 'Вы — оператор',
    enabled: true,
  },
  {
    id: 'exam',
    title: 'Экзамен',
    lead: 'Тот же формат, что тренировка, но преподаватель сможет вмешиваться в разговор. Пока недоступно.',
    youAre: 'Вы — оператор',
    enabled: false,
  },
];

export const SERVICE_LABEL: Record<ServiceKind, string> = {
  fire: 'Пожарные',
  ambulance: 'Скорая',
  police: 'Полиция',
  gas: 'Газовая',
};

export const DIFFICULTY_ORDER: TrainingScenario['difficulty'][] = ['базовый', 'стандарт', 'сложный'];

export const DIFFICULTY_LABEL: Record<TrainingScenario['difficulty'], string> = {
  базовый: 'Базовый',
  стандарт: 'Стандарт',
  сложный: 'Сложный',
};

export const SCENARIOS: TrainingScenario[] = [...AGS_SCENARIOS];

export function getScenario(id: string): TrainingScenario | undefined {
  return SCENARIOS.find((item) => item.id === id);
}
