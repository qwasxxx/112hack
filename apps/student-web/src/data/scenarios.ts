import { AGS_SCENARIOS } from './ags-tickets';
import { buildCatalog } from './ticket-catalog';

export type ServiceKind = 'fire' | 'ambulance' | 'police' | 'gas';

export type CardField = {
  key: string;
  label: string;
  type: 'string' | 'text' | 'enum' | 'phone';
  required: boolean;
  options?: string[];
};

export type CallerTtsVoice = {
  speaker: 'aidar' | 'baya' | 'eugene' | 'kseniya' | 'xenia';
  pitch: 'low' | 'medium' | 'high';
  speed: number;
  emotion: 'panic' | 'scared';
  gender: 'male' | 'female';
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
  ttsVoice?: CallerTtsVoice;
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
    id: 'training',
    title: 'Тренировка',
    lead: 'Вы — оператор 112. На линии заявитель. Принимаете вызов и заполняете карточку.',
    youAre: 'Вы — оператор',
    enabled: true,
  },
  {
    id: 'exam',
    title: 'Экзамен',
    lead: 'Аттестация: принять вызов, заполнить карточку, сверить с эталоном. Зачёт от 80 баллов. Подсказок на линии нет.',
    youAre: 'Вы — оператор',
    enabled: true,
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

export function refreshScenarioCatalog(): TrainingScenario[] {
  const next = buildCatalog();
  SCENARIOS.splice(0, SCENARIOS.length, ...next);
  return SCENARIOS;
}

export function getScenario(id: string): TrainingScenario | undefined {
  if (!SCENARIOS.length) {
    refreshScenarioCatalog();
  }
  return SCENARIOS.find((item) => item.id === id);
}
