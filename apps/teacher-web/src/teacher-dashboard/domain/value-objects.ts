export const formatDuration = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

export const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

export const difficultyLabels = {
  intro: 'Вводный',
  standard: 'Стандартный',
  advanced: 'Продвинутый',
  stress: 'Стрессовый',
} as const;

export const emotionLabels = {
  calm: 'Спокоен',
  anxious: 'Тревога',
  panicked: 'Паника',
  angry: 'Злость',
  confused: 'Растерянность',
  in_pain: 'Боль',
  withdrawn: 'Замкнутость',
} as const;
