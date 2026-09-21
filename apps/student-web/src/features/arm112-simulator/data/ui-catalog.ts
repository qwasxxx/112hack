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

export type { EvidencedService } from './gsi-services';
export { EVIDENCED_SERVICES, mapClassifierServiceName } from './gsi-services';

export const MAP_RADIUS_OPTIONS = ['50 м', '100 м', '200 м', '1000 м'] as const;
export const MAP_LAYERS = ['Камеры', 'Техника', 'Объекты'] as const;

export const PHONE_MASK = '+7 ( ) - -';
