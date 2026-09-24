import type { DdsSourceRef } from './types';

export const DDS_SOURCE = {
  journal: [
    { kind: 'dds-screenshot', ref: 'СКРИНШОТ ДДСГСИ image2 — Поиск происшествий, пустой список' },
    { kind: 'dds-screenshot', ref: 'СКРИНШОТ ДДСГСИ image3/4/5 — строки списка и колонки' },
    { kind: 'dds-caption', ref: 'РАБОЧЕЕ ПОЛЕ ДДС' },
  ] satisfies DdsSourceRef[],
  card: [
    { kind: 'dds-screenshot', ref: 'СКРИНШОТ ДДСГСИ image6/7 — карточка 36814845, просмотр' },
    { kind: 'dds-caption', ref: 'РАБОЧЕЕ ПОЛЕ КАРТОЧКИ ДДС' },
  ] satisfies DdsSourceRef[],
  statusForm: [
    { kind: 'dds-screenshot', ref: 'СКРИНШОТ ДДСГСИ image8/9 — Статус, Номер наряда, Комментарий, ✓, ×' },
    { kind: 'dds-caption', ref: 'ПРИНЯТО/НЕ ПРИНЯТО; карандаш: НАЧАЛО РЕАГИРОВАНИЯ / ОТКАЗ / РАБОТЫ ЗАВЕРШЕНЫ' },
  ] satisfies DdsSourceRef[],
  history: [
    { kind: 'dds-screenshot', ref: 'СКРИНШОТ ДДСГСИ image10–20 — история статусов на чипе Поселение Вороновское' },
  ] satisfies DdsSourceRef[],
  queue: [
    { kind: 'case-spec', ref: 'case §10 действия с карточками — очередь карточек для отработки' },
  ] satisfies DdsSourceRef[],
} as const;