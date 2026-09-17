/** Labels and option lists taken from ARM-112 screenshots / instruction. Do not invent names. */

export const COMMUNICATION_CHANNELS = [
  'ЕССМ',
  'Линия ДСП (связь с руководством смены)',
  'МГТС-112',
  'Мегафон',
  'Мобильное приложение',
  'МТС',
  'МЧС',
  'Tele2',
  'Билайн',
] as const;

export const OKRUG_OPTIONS = [
  'ВАО',
  'ЗАО',
  'ЗелАО',
  'МО',
  'Москва',
  'ЦАО',
  'САО',
  'СЗАО',
  'ЮАО',
  'ЮЗАО',
  'ТАО',
] as const;

export const JOURNAL_NAV = [
  'журнал',
  'экран',
  'статистика',
  'УЕР',
  'вики',
  'заявители',
  'техника',
  'аудит',
  'отчеты',
] as const;

export const JOURNAL_COLUMNS = [
  'Связи',
  'ЧС',
  'Опер.',
  'АРМ',
  'Номер',
  'Дата',
  'Время',
  'Что случилось',
  'Постр.',
  'Статус',
  'Адрес',
  'Проверена',
] as const;

export type EvidencedService = {
  short: string;
  full: string;
};

export const EVIDENCED_SERVICES: EvidencedService[] = [
  {
    short: 'Служба 101',
    full: 'Служба 101 (ГУ МЧС России по г.Москве, ГКУ "Пожарно спасательный центр" ОДС)',
  },
  { short: 'ФСБ', full: 'ФСБ (Федеральная Служба Безопасности)' },
  { short: 'ЦЭМП', full: 'ЦЭМП' },
  {
    short: 'Служба 103',
    full: 'Служба 103 (ГБУ города Москвы Станция скорой и неотложной медицинской помощи им А.С. Пучкова)',
  },
  { short: 'Служба 104', full: 'Служба 104 (АО "МОСГАЗ" Диспетчерское управление)' },
  { short: 'Служба 102', full: 'Служба 102' },
  { short: 'Деп. ЖКХ', full: 'Деп. ЖКХ' },
  { short: 'ЦОДД', full: 'ЦОДД' },
  { short: 'Мос.Без.', full: 'Мос.Без.' },
  { short: 'Мослифт', full: 'Мослифт' },
  { short: 'МЧС', full: 'МЧС (Министерство Чрезвычайных Ситуаций)' },
  { short: 'МВД', full: 'МВД (Министерство Внутренних Дел)' },
  { short: 'Скорая', full: 'Скорая (Скорая)' },
  { short: 'Мосгаз', full: 'Мосгаз (Мосгаз)' },
];

export const MAP_RADIUS_OPTIONS = ['50 м', '100 м', '200 м', '1000 м'] as const;
export const MAP_LAYERS = ['Камеры', 'Техника', 'Объекты'] as const;

export const PHONE_MASK = '+7 ( ) - -';
